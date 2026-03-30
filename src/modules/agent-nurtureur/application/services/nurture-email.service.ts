import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { NurtureSequence } from '../../domain/entities/nurture-sequence.entity';
import { NURTURE_CONTENT_POOL, NurtureContent } from '../../infrastructure/config/nurture-content.config';
import {
  NURTURE_SYSTEM_PROMPT,
  buildNurtureUserPrompt,
  sanitizeForPrompt,
  RE_PERMISSION_TEMPLATE,
} from '../../infrastructure/config/nurture-prompts.config';

export type NurtureBranch = 'ACCELERATE' | 'CHANGE_CTA' | 'RETRY' | 'PIVOT' | 'EXIT';

@Injectable()
export class NurtureEmailService {
  private readonly logger = new Logger(NurtureEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly emailAdapter: IEmailAdapter,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.NURTURER_PIPELINE) private readonly queue: Queue,
  ) {}

  async sendNurtureEmail(prospectId: string, sequence: NurtureSequence): Promise<void> {
    const prospect = await this.prisma.prospect.findUniqueOrThrow({
      where: { id: prospectId },
      select: { fullName: true, jobTitle: true, companyName: true, email: true },
    });

    const content = this.selectContent(
      sequence.segment ?? 'pme_metro',
      sequence.journeyStage,
      sequence.emailsNurtureSent,
    );

    const contentType = this.getContentType(sequence.emailsNurtureSent);

    const userPrompt = buildNurtureUserPrompt({
      fullName: sanitizeForPrompt(prospect.fullName ?? ''),
      jobTitle: sanitizeForPrompt(prospect.jobTitle ?? ''),
      companyName: sanitizeForPrompt(prospect.companyName ?? ''),
      segment: sanitizeForPrompt(sequence.segment ?? 'pme_metro'),
      journeyStage: sanitizeForPrompt(sequence.journeyStage),
      contentType: sanitizeForPrompt(contentType),
      emailsSent: sequence.emailsNurtureSent,
      originalSignal: sanitizeForPrompt(sequence.entryReason),
      contentTitle: sanitizeForPrompt(content.title),
      contentSummary: sanitizeForPrompt(content.summary),
    });

    const llmResult = await this.llmService.call({
      task: LlmTask.GENERATE_EMAIL,
      systemPrompt: NURTURE_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 300,
      temperature: 0.7,
    });

    const sanitizedOutput = this.sanitizeLlmOutput(llmResult.content);

    let parsed: { subject: string; body: string; preview: string };
    try {
      parsed = JSON.parse(sanitizedOutput);
    } catch {
      this.logger.warn({ msg: 'Failed to parse LLM JSON output, using fallback', prospectId });
      parsed = {
        subject: content.title,
        body: sanitizedOutput,
        preview: content.summary.slice(0, 90),
      };
    }

    const unsubscribeUrl = `${this.configService.get<string>('APP_BASE_URL')}/unsubscribe?prospectId=${prospectId}`;
    const lcenFooter = [
      '---',
      `Axiom Marketing — SIRET ${this.configService.get<string>('AXIOM_SIRET')}`,
      this.configService.get<string>('AXIOM_ADDRESS'),
      `Pour ne plus recevoir nos emails : ${unsubscribeUrl}`,
    ].join('\n');

    const htmlBody = `${parsed.body}\n\n${lcenFooter}`;

    const senderEmail = this.configService.get<string>('AXIOM_SENDER_EMAIL') ?? 'contact@axiom-marketing.fr';

    await this.emailAdapter.sendEmail({
      from: senderEmail,
      to: [prospect.email!],
      subject: parsed.subject,
      htmlBody,
      textBody: htmlBody,
      trackOpens: true,
      trackClicks: true,
      tags: ['nurture', sequence.journeyStage, contentType],
    });

    const nurtureRecord = await this.prisma.nurtureProspect.findUnique({
      where: { prospectId },
      select: { id: true },
    });

    if (nurtureRecord) {
      await this.prisma.nurtureInteraction.create({
        data: {
          nurtureId: nurtureRecord.id,
          prospectId,
          interactionType: 'nurture_email_sent',
          channel: 'email',
          contentTitle: content.title,
          contentUrl: content.url,
          details: {
            subject: parsed.subject,
            contentId: content.id,
            journeyStage: sequence.journeyStage,
            contentType,
          },
        },
      });

      await this.prisma.nurtureProspect.update({
        where: { prospectId },
        data: {
          emailsNurtureSent: { increment: 1 },
          lastEmailSentAt: new Date(),
          currentStep: { increment: 1 },
          lastInteractionAt: new Date(),
        },
      });
    }

    this.logger.log({ msg: 'Nurture email sent', prospectId, contentId: content.id, journeyStage: sequence.journeyStage });
  }

  selectContent(segment: string, journeyStage: string, emailsSent: number): NurtureContent {
    const stageFiltered = NURTURE_CONTENT_POOL.filter(
      (c) => c.journeyStage === journeyStage && c.segments.includes(segment),
    );

    const contentType = this.getContentType(emailsSent);
    const typeFiltered = stageFiltered.filter((c) => c.contentType === contentType);

    const pool = typeFiltered.length > 0 ? typeFiltered : stageFiltered.length > 0 ? stageFiltered : NURTURE_CONTENT_POOL;

    const index = emailsSent % pool.length;
    return pool[index];
  }

  getContentType(totalSent: number): 'valeur' | 'promo' {
    return (totalSent + 1) % 4 === 0 ? 'promo' : 'valeur';
  }

  determineBranch(sequence: NurtureSequence, lastOpened: boolean, lastClicked: boolean): NurtureBranch {
    if (lastOpened && lastClicked) return 'ACCELERATE';
    if (lastOpened && !lastClicked) return 'CHANGE_CTA';
    if (!lastOpened && sequence.consecutiveUnopened === 0) return 'RETRY';
    if (!lastOpened && sequence.consecutiveUnopened === 1) return 'PIVOT';
    if (!lastOpened && sequence.consecutiveUnopened >= 2) return 'EXIT';
    return 'RETRY';
  }

  getDelayForBranch(branch: NurtureBranch): number {
    const DAY_MS = 86400000;
    switch (branch) {
      case 'ACCELERATE':
        return 3 * DAY_MS;
      case 'CHANGE_CTA':
        return 5 * DAY_MS;
      case 'RETRY':
        return 3 * DAY_MS;
      case 'PIVOT':
        return 10 * DAY_MS;
      case 'EXIT':
        return 60 * DAY_MS;
    }
  }

  advanceJourneyStage(sequence: NurtureSequence): 'awareness' | 'consideration' | 'decision' {
    if (sequence.currentStep >= 9) return 'decision';
    if (sequence.currentStep >= 5) return 'consideration';
    return 'awareness';
  }

  async startReEngagementSequence(prospectId: string): Promise<void> {
    const DAY_MS = 86400000;

    const prospect = await this.prisma.prospect.findUniqueOrThrow({
      where: { id: prospectId },
      select: { fullName: true, email: true },
    });

    const senderEmail = this.configService.get<string>('AXIOM_SENDER_EMAIL') ?? 'contact@axiom-marketing.fr';
    const unsubscribeUrl = `${this.configService.get<string>('APP_BASE_URL')}/unsubscribe?prospectId=${prospectId}`;

    const reEngagementSubject = 'Ça fait un moment...';
    const reEngagementBody = `Bonjour ${sanitizeForPrompt(prospect.fullName ?? '')},\n\nCela fait un moment que nous ne vous avons pas donné de nouvelles.\n\nNous avons de nouvelles ressources qui pourraient vous intéresser.\n\n---\nPour ne plus recevoir nos emails : ${unsubscribeUrl}`;

    await this.emailAdapter.sendEmail({
      from: senderEmail,
      to: [prospect.email!],
      subject: reEngagementSubject,
      htmlBody: reEngagementBody,
      textBody: reEngagementBody,
      trackOpens: true,
      trackClicks: true,
      tags: ['re-engagement'],
    });

    await this.queue.add('execute-nurture-step', { prospectId, step: 're_engagement_2' }, { delay: 8 * DAY_MS });
    await this.queue.add('execute-nurture-step', { prospectId, step: 're_permission' }, { delay: 15 * DAY_MS });
    await this.queue.add('sunset-prospect', { prospectId }, { delay: 22 * DAY_MS });

    this.logger.log({ msg: 'Re-engagement sequence started', prospectId });
  }

  async sendRePermissionEmail(prospectId: string): Promise<void> {
    const DAY_MS = 86400000;

    const prospect = await this.prisma.prospect.findUniqueOrThrow({
      where: { id: prospectId },
      select: { fullName: true, firstName: true, email: true },
    });

    const baseUrl = this.configService.get<string>('APP_BASE_URL');
    const unsubscribeUrl = `${baseUrl}/unsubscribe?prospectId=${prospectId}`;
    const resubscribeUrl = `${baseUrl}/resubscribe?prospectId=${prospectId}`;

    const firstName = sanitizeForPrompt(prospect.firstName ?? prospect.fullName ?? 'vous');
    const senderEmail = this.configService.get<string>('AXIOM_SENDER_EMAIL') ?? 'contact@axiom-marketing.fr';

    const body = RE_PERMISSION_TEMPLATE.body
      .replace('{firstName}', firstName)
      .replace('{duration}', 'plusieurs semaines')
      .replace('{topic}', 'marketing digital')
      .replace('{resubscribeUrl}', resubscribeUrl)
      .replace('{unsubscribeUrl}', unsubscribeUrl);

    const lcenFooter = [
      '---',
      `Axiom Marketing — SIRET ${this.configService.get<string>('AXIOM_SIRET')}`,
      this.configService.get<string>('AXIOM_ADDRESS'),
      `Pour ne plus recevoir nos emails : ${unsubscribeUrl}`,
    ].join('\n');

    const fullBody = `${body}\n\n${lcenFooter}`;

    await this.emailAdapter.sendEmail({
      from: senderEmail,
      to: [prospect.email!],
      subject: RE_PERMISSION_TEMPLATE.subject,
      htmlBody: fullBody,
      textBody: fullBody,
      trackOpens: true,
      trackClicks: true,
      tags: ['re-permission'],
    });

    await this.queue.add('check-re-permission-response', { prospectId }, { delay: 5 * DAY_MS });

    this.logger.log({ msg: 'Re-permission email sent', prospectId });
  }

  private sanitizeLlmOutput(output: string): string {
    return output
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .trim();
  }
}
