import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IMessageSendRepository } from '../../domain/repositories/i-message-send.repository';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { MessageSend } from '../../domain/entities/message-send.entity';
import { ExecuteStepDto } from '../dtos/execute-step.dto';
import { ResponseClassifierService, ClassificationResult } from './response-classifier.service';
import { SequenceOrchestratorService } from './sequence-orchestrator.service';
import { ActionHandlerService } from './action-handler.service';

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
  ) {}

  async executeSequenceStep(dto: ExecuteStepDto): Promise<MessageSend> {
    this.logger.log({
      msg: 'Executing sequence step',
      prospectId: dto.prospectId,
      sequenceId: dto.sequenceId,
    });

    // TODO: fetch sequence step config and prospect contact data
    // TODO: fetch generated message for this step
    const fromEmail = 'noreply@axiom-marketing.fr';
    const toEmail = 'prospect@example.com';
    const subject = 'Votre projet digital';
    const messageId = crypto.randomUUID();

    const messageSend = MessageSend.create({
      prospectId: dto.prospectId,
      messageId,
      sequenceId: dto.sequenceId,
      fromEmail,
      toEmail,
      subject,
    });

    try {
      const saved = await this.messageSendRepository.save(messageSend);

      await this.emailAdapter.sendEmail({
        from: fromEmail,
        to: [toEmail],
        subject,
        htmlBody: '<p>Message content here</p>',
      });

      const sent = saved.markAsSent();
      const updated = await this.messageSendRepository.updateStatus(sent);

      this.eventEmitter.emit('message.sent', {
        prospectId: dto.prospectId,
        messageSendId: updated.id,
      });
      this.logger.log({
        msg: 'Sequence step executed',
        prospectId: dto.prospectId,
        messageSendId: updated.id,
      });

      return updated;
    } catch (error) {
      const failed = messageSend.markAsFailed((error as Error).message);
      await this.messageSendRepository.save(failed);
      throw error;
    }
  }

  async classifyReply(replyBody: string, prospectId: string): Promise<ClassificationResult> {
    this.logger.log({ msg: 'Classifying reply', prospectId });
    // Minimal classification with available data — caller provides full params via processReply
    return this.responseClassifier.classify({
      replyBody,
      fromAddress: '',
      subject: '',
      prospectName: '',
      prospectCompany: '',
      prospectPoste: '',
      lastMessageSent: '',
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

    this.logger.log({
      msg: 'Reply classified',
      prospectId: params.prospectId,
      category: classification.category,
      confidence: classification.confidence,
    });

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

  async detectResponses(): Promise<void> {
    this.logger.log({ msg: 'Detecting email responses' });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const replies = await this.emailAdapter.getUnreadReplies(since);

    for (const reply of replies) {
      this.logger.log({ msg: 'Reply detected', messageId: reply.messageId, from: reply.from });

      // Match reply to a sent message via message-id in subject or body heuristic
      // EmailThreadMessage does not carry In-Reply-To header; matching is done by messageId reference
      const sends = await this.messageSendRepository.findByProspectId('');
      const matched = sends.find((s) => s.messageId === reply.messageId);

      if (matched) {
        this.logger.log({
          msg: 'Reply matched to send',
          messageSendId: matched.id,
          prospectId: matched.prospectId,
        });

        const replied = matched.markAsReplied();
        await this.messageSendRepository.updateStatus(replied);

        this.eventEmitter.emit('response.detected', {
          prospectId: matched.prospectId,
          sequenceId: matched.sequenceId,
          messageSendId: matched.id,
          replyBody: reply.body,
          fromAddress: reply.from,
          subject: reply.subject,
        });
      } else {
        this.logger.warn({
          msg: 'Reply could not be matched to any send',
          messageId: reply.messageId,
        });
      }

      await this.emailAdapter.markAsRead(reply.messageId);
    }

    this.logger.log({ msg: 'Response detection complete', repliesFound: replies.length });
  }

  async scheduleNextStep(
    prospectId: string,
    sequenceId: string,
    currentStep: number,
  ): Promise<void> {
    if (!this.sequenceOrchestrator.isBusinessHours()) {
      this.logger.log({
        msg: 'Outside business hours, will schedule at next optimal time',
        prospectId,
      });
    }

    const { delayMs, hasNextStep } = this.sequenceOrchestrator.getNextStepDelay(
      sequenceId,
      currentStep,
    );

    if (!hasNextStep) {
      this.logger.log({ msg: 'Sequence complete, no next step', prospectId, sequenceId });
      this.eventEmitter.emit('sequence.completed', { prospectId, sequenceId });
      return;
    }

    const baseTime = new Date(Date.now() + delayMs);
    const sendTime = this.sequenceOrchestrator.calculateSendTime(baseTime);

    this.logger.log({
      msg: 'Next step scheduled',
      prospectId,
      sequenceId,
      nextStep: currentStep + 1,
      sendTime: sendTime.toISOString(),
    });

    this.eventEmitter.emit('sequence.step.scheduled', {
      prospectId,
      sequenceId,
      step: currentStep + 1,
      scheduledFor: sendTime,
    });
  }

  async getSendsByProspectId(prospectId: string): Promise<MessageSend[]> {
    return this.messageSendRepository.findByProspectId(prospectId);
  }
}
