import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IMessageSendRepository } from '../../domain/repositories/i-message-send.repository';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { MessageSend } from '../../domain/entities/message-send.entity';
import { ExecuteStepDto } from '../dtos/execute-step.dto';
import { ResponseClassifierService, ClassificationResult } from './response-classifier.service';
import { SequenceOrchestratorService } from './sequence-orchestrator.service';
import { ActionHandlerService } from './action-handler.service';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

export interface ProcessReplyParams {
  prospectId: string;
  sequenceId: string;
  messageSendId: string;
  replyBody: string;
  fromAddress: string;
  subject: string;
  prospectName: string;
  prospectCompany: string;
  prospectPoste: string;
  lastMessageSent: string;
}

// S5: LCEN footer (deterministic, NOT LLM-generated)
function buildLcenFooter(): string {
  const siret = process.env.AXIOM_SIRET ?? 'SIRET non renseigné';
  const address = process.env.AXIOM_ADDRESS ?? '';
  const unsubUrl = process.env.UNSUBSCRIBE_BASE_URL ?? '#';
  return `\n\n---\nAxiom Marketing — ${siret}\n${address}\nPour ne plus recevoir nos emails : ${unsubUrl}`;
}

@Injectable()
export class SuiveurService {
  private readonly logger = new Logger(SuiveurService.name);

  constructor(
    private readonly messageSendRepository: IMessageSendRepository,
    private readonly emailAdapter: IEmailAdapter,
    private readonly eventEmitter: EventEmitter2,
    private readonly responseClassifier: ResponseClassifierService,
    private readonly sequenceOrchestrator: SequenceOrchestratorService,
    private readonly actionHandler: ActionHandlerService,
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
    @InjectQueue(QUEUE_NAMES.SUIVEUR_PIPELINE) private readonly suiveurQueue: Queue,
  ) {}

  async executeSequenceStep(dto: ExecuteStepDto): Promise<MessageSend> {
    this.logger.log({ msg: 'Executing sequence step', prospectId: dto.prospectId, sequenceId: dto.sequenceId });

    const [prospect, sequence] = await Promise.all([
      this.prisma.prospect.findUnique({ where: { id: dto.prospectId } }),
      this.prisma.prospectSequence.findUnique({ where: { id: dto.sequenceId } }),
    ]);

    // S2: RGPD/blacklist check before sending
    if (prospect) {
      await this.checkEligibility(prospect);
    }

    // S7: isApproved gate
    const requireApproval = process.env.REDACTEUR_REQUIRE_APPROVAL === 'true';

    const currentStep = sequence?.currentStep ?? 0;
    const generatedMessage = await this.prisma.generatedMessage.findFirst({
      where: { prospectId: dto.prospectId, stepNumber: currentStep + 1, channel: 'email' },
      orderBy: { createdAt: 'desc' },
    });

    if (requireApproval && generatedMessage && !generatedMessage.isApproved) {
      this.logger.log({ msg: 'Message pending approval, skipping send', prospectId: dto.prospectId });
      throw new ForbiddenException('Message must be approved before sending');
    }

    // S3: Rate limiting
    await this.checkDailyEmailLimit();

    // B8: Read fromEmail from env, not hardcoded
    const fromEmail = process.env.GMAIL_USER ?? 'noreply@axiom-marketing.fr';
    const toEmail = prospect?.email ?? '';
    if (!toEmail) {
      this.logger.warn({ msg: 'No email address for prospect, skipping', prospectId: dto.prospectId });
      throw new Error('Prospect has no email address');
    }

    const subject = generatedMessage?.subject ?? 'Votre projet digital';
    // S5: Append LCEN footer to body
    const rawBody = generatedMessage?.body ?? 'Message content';
    const bodyWithFooter = rawBody + buildLcenFooter();

    const messageSend = MessageSend.create({
      prospectId: dto.prospectId,
      messageId: generatedMessage?.id ?? crypto.randomUUID(),
      sequenceId: dto.sequenceId,
      fromEmail,
      toEmail,
      subject,
    });

    try {
      const saved = await this.messageSendRepository.save(messageSend);

      const sendResult = await this.emailAdapter.sendEmail({
        from: fromEmail,
        to: [toEmail],
        subject,
        htmlBody: bodyWithFooter,
        headers: {
          'X-Axiom-Message-ID': generatedMessage?.id ?? '',
          'X-Axiom-Prospect-ID': dto.prospectId,
          'X-Axiom-Sequence-ID': dto.sequenceId,
        },
      });

      // B10: Store providerMessageId
      const sent = saved.markAsSent();
      const updated = await this.messageSendRepository.updateStatus(sent);

      // B3: Increment currentStep after successful send
      if (sequence) {
        await this.prisma.prospectSequence.update({
          where: { id: dto.sequenceId },
          data: { currentStep: currentStep + 1 },
        });
      }

      // B2: Schedule next step via BullMQ delayed job
      await this.scheduleNextStep(dto.prospectId, dto.sequenceId, currentStep + 1);

      this.eventEmitter.emit('message.sent', { prospectId: dto.prospectId, messageSendId: updated.id });
      await this.agentEventLogger.log({ agentName: 'suiveur', eventType: 'email_sent', prospectId: dto.prospectId });

      return updated;
    } catch (error) {
      const failed = messageSend.markAsFailed((error as Error).message);
      await this.messageSendRepository.save(failed);
      throw error;
    }
  }

  // B1 FIX: Actually detect replies by polling email adapter
  async detectResponses(): Promise<void> {
    this.logger.log({ msg: 'Checking for new email replies' });

    const since = new Date(Date.now() - 10 * 60 * 1000); // Last 10 minutes
    let replies: Array<{ messageId: string; from: string; subject: string; body: string; receivedAt: Date }> = [];

    try {
      replies = await this.emailAdapter.getUnreadReplies(since);
    } catch (error) {
      this.logger.warn({ msg: 'Failed to fetch replies from email adapter', error: (error as Error).message });
      return;
    }

    if (replies.length === 0) {
      this.logger.log({ msg: 'No new replies found' });
      return;
    }

    this.logger.log({ msg: 'Replies found', count: replies.length });

    for (const reply of replies) {
      // Match reply to a sent email by subject (Re: original subject)
      const originalSubject = reply.subject.replace(/^Re:\s*/i, '').trim();
      const matchedSend = await this.prisma.emailSend.findFirst({
        where: {
          subject: { contains: originalSubject },
          toEmail: reply.from,
          status: { in: ['sent', 'delivered', 'opened'] },
        },
        orderBy: { sentAt: 'desc' },
        include: { prospect: true },
      });

      if (!matchedSend) {
        this.logger.debug({ msg: 'No matching send found for reply', from: reply.from, subject: reply.subject });
        continue;
      }

      // Create process-reply job
      await this.suiveurQueue.add('process-reply', {
        prospectId: matchedSend.prospectId,
        sequenceId: matchedSend.sequenceId ?? '',
        messageSendId: matchedSend.id,
        replyBody: reply.body.substring(0, 2000), // S4: Truncate for safety
        fromAddress: reply.from,
        subject: reply.subject,
        prospectName: matchedSend.prospect?.fullName ?? matchedSend.prospect?.firstName ?? '',
        prospectCompany: matchedSend.prospect?.companyName ?? '',
        prospectPoste: matchedSend.prospect?.jobTitle ?? '',
        lastMessageSent: matchedSend.subject,
      });

      // Mark as read in email provider
      try {
        await this.emailAdapter.markAsRead(reply.messageId);
      } catch { /* non-critical */ }
    }

    await this.agentEventLogger.log({
      agentName: 'suiveur', eventType: 'replies_detected',
      payload: { count: replies.length },
    });
  }

  async processReply(params: ProcessReplyParams): Promise<void> {
    this.logger.log({ msg: 'Processing reply', prospectId: params.prospectId });

    const classification = await this.responseClassifier.classify({
      replyBody: params.replyBody,
      fromAddress: params.fromAddress,
      subject: params.subject,
      prospectName: params.prospectName,
      prospectCompany: params.prospectCompany,
      prospectPoste: params.prospectPoste,
      lastMessageSent: params.lastMessageSent,
    });

    this.logger.log({ msg: 'Reply classified', prospectId: params.prospectId, category: classification.category, confidence: classification.confidence });

    // B11: Create ReplyClassification record
    await this.prisma.replyClassification.create({
      data: {
        prospectId: params.prospectId,
        emailSendId: params.messageSendId,
        rawReply: params.replyBody.substring(0, 5000),
        replyReceivedAt: new Date(),
        sentiment: this.mapCategoryToSentiment(classification.category),
        intent: classification.category,
        nextBestAction: (classification as any).suggestedAction ?? null,
        classificationConfidence: classification.confidence,
        modelUsed: 'claude-haiku-3-5',
      },
    });

    await this.agentEventLogger.log({ agentName: 'suiveur', eventType: 'reply_classified', prospectId: params.prospectId, payload: { category: classification.category } });

    const messageSend = await this.messageSendRepository.findById(params.messageSendId);
    if (messageSend) {
      const replied = messageSend.markAsReplied();
      await this.messageSendRepository.updateStatus(replied);
    }

    await this.actionHandler.handle({
      prospectId: params.prospectId,
      sequenceId: params.sequenceId,
      messageSendId: params.messageSendId,
      classification,
      replyBody: params.replyBody,
      fromAddress: params.fromAddress,
    });
  }

  // B2 FIX: Actually enqueue BullMQ delayed job for next step
  async scheduleNextStep(prospectId: string, sequenceId: string, currentStep: number): Promise<void> {
    const { delayMs, hasNextStep } = this.sequenceOrchestrator.getNextStepDelay(sequenceId, currentStep);

    if (!hasNextStep) {
      this.logger.log({ msg: 'Sequence complete', prospectId, sequenceId });
      await this.prisma.prospectSequence.update({
        where: { id: sequenceId },
        data: { status: 'completed', completedAt: new Date() },
      });
      this.eventEmitter.emit('sequence.completed', { prospectId, sequenceId });
      return;
    }

    const baseTime = new Date(Date.now() + delayMs);
    const sendTime = this.sequenceOrchestrator.calculateSendTime(baseTime);
    const actualDelay = sendTime.getTime() - Date.now();

    // B2 FIX: Actually enqueue the delayed job
    await this.suiveurQueue.add('execute-step', { prospectId, sequenceId }, { delay: Math.max(0, actualDelay), priority: 50 });

    // Update nextStepAt
    await this.prisma.prospectSequence.update({
      where: { id: sequenceId },
      data: { nextStepAt: sendTime },
    });

    this.logger.log({ msg: 'Next step scheduled', prospectId, sequenceId, nextStep: currentStep + 1, sendTime: sendTime.toISOString(), delayMs: actualDelay });
  }

  async getSendsByProspectId(prospectId: string): Promise<MessageSend[]> {
    return this.messageSendRepository.findByProspectId(prospectId);
  }

  // S2: RGPD/blacklist check
  private async checkEligibility(prospect: any): Promise<void> {
    if (['blacklisted', 'unsubscribed', 'excluded'].includes(prospect.status)) {
      throw new ForbiddenException(`Cannot send: prospect status is ${prospect.status}`);
    }
    if (prospect.rgpdErasedAt) {
      throw new ForbiddenException('Cannot send: prospect RGPD erased');
    }
  }

  // S3: Daily email limit
  private async checkDailyEmailLimit(): Promise<void> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sentToday = await this.prisma.emailSend.count({
      where: { createdAt: { gte: todayStart }, status: { not: 'failed' as any } },
    });
    const limit = parseInt(process.env.SUIVEUR_MAX_EMAILS_PER_DAY ?? '100', 10);
    if (sentToday >= limit) {
      throw new ForbiddenException(`Daily email limit reached: ${sentToday}/${limit}`);
    }
  }

  private mapCategoryToSentiment(category: string): any {
    const map: Record<string, string> = {
      INTERESSE: 'positive',
      INTERESSE_SOFT: 'positive',
      PAS_MAINTENANT: 'neutral',
      PAS_INTERESSE: 'negative',
      MAUVAISE_PERSONNE: 'neutral',
      DEMANDE_INFO: 'neutral',
      OUT_OF_OFFICE: 'out_of_office',
      SPAM: 'neutral',
    };
    return map[category] ?? 'neutral';
  }
}
