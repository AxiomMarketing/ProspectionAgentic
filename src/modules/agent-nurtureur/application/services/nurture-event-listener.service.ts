import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { NurtureurService } from './nurtureur.service';

@Injectable()
export class NurtureEventListenerService {
  private readonly logger = new Logger(NurtureEventListenerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nurtureurService: NurtureurService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. nurture.started
  // ---------------------------------------------------------------------------
  @OnEvent('nurture.started')
  async handleNurtureStarted(payload: { sequenceId: string; prospectId: string }): Promise<void> {
    this.logger.log({ msg: 'nurture.started received', ...payload });
    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'nurture_started',
      prospectId: payload.prospectId,
      payload: { sequenceId: payload.sequenceId },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. nurture.reactivated
  // ---------------------------------------------------------------------------
  @OnEvent('nurture.reactivated')
  async handleNurtureReactivated(payload: { sequenceId: string; prospectId: string }): Promise<void> {
    this.logger.log({ msg: 'nurture.reactivated received', ...payload });
    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'nurture_reactivated',
      prospectId: payload.prospectId,
      payload: { sequenceId: payload.sequenceId },
    });
  }

  // ---------------------------------------------------------------------------
  // 3. nurture.step.processed
  // ---------------------------------------------------------------------------
  @OnEvent('nurture.step.processed')
  async handleStepProcessed(payload: {
    sequenceId: string;
    prospectId: string;
    stepType: string;
  }): Promise<void> {
    this.logger.log({ msg: 'nurture.step.processed received', ...payload });
    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'nurture_step_processed',
      prospectId: payload.prospectId,
      payload: { sequenceId: payload.sequenceId, stepType: payload.stepType },
    });
  }

  // ---------------------------------------------------------------------------
  // 4. nurture.exited
  // ---------------------------------------------------------------------------
  @OnEvent('nurture.exited')
  async handleNurtureExited(payload: {
    sequenceId: string;
    prospectId: string;
    reason: string;
  }): Promise<void> {
    this.logger.log({ msg: 'nurture.exited received', ...payload });

    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'nurture_exited',
      prospectId: payload.prospectId,
      payload: { sequenceId: payload.sequenceId, reason: payload.reason },
    });

    // For RGPD sunset exits, ensure blacklist entry exists
    if (payload.reason === 'rgpd_sunset_180d') {
      const prospect = await this.prisma.prospect.findUnique({
        where: { id: payload.prospectId },
        select: { email: true },
      });
      if (prospect?.email) {
        const existing = await this.prisma.rgpdBlacklist.findFirst({
          where: { email: prospect.email },
        });
        if (!existing) {
          await this.prisma.rgpdBlacklist.create({
            data: { email: prospect.email, reason: 'nurture_sunset_180d', source: 'nurtureur' },
          });
          this.logger.log({ msg: 'RGPD blacklist entry ensured', prospectId: payload.prospectId });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. nurture.rescore.triggered
  // ---------------------------------------------------------------------------
  @OnEvent('nurture.rescore.triggered')
  async handleRescoreTriggered(payload: { prospectId: string }): Promise<void> {
    this.logger.log({ msg: 'nurture.rescore.triggered received', ...payload });
    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'nurture_rescore_triggered',
      prospectId: payload.prospectId,
    });
  }

  // ---------------------------------------------------------------------------
  // 6. reply.classified — Integration with Agent 5 Suiveur
  // ---------------------------------------------------------------------------
  @OnEvent('reply.classified')
  async handleReplyClassified(payload: {
    prospectId: string;
    sequenceId?: string;
    intent: string;
  }): Promise<void> {
    this.logger.log({ msg: 'reply.classified received for nurtureur', intent: payload.intent, prospectId: payload.prospectId });

    const activeNurture = await this.prisma.nurtureProspect.findFirst({
      where: { prospectId: payload.prospectId, status: 'active' },
      select: { id: true },
    });

    if (!activeNurture) return;

    if (payload.intent === 'INTERESSE' || payload.intent === 'MEETING_REQUEST') {
      // Pause nurture and hand off HOT to scoreur
      await this.prisma.nurtureProspect.update({
        where: { id: activeNurture.id },
        data: { status: 'paused' },
      });
      await this.prisma.prospect.update({
        where: { id: payload.prospectId },
        data: { status: 'replied' },
      });
      await this.nurtureurService.triggerReScore(payload.prospectId);
      this.logger.log({ msg: 'HOT handoff — nurture paused, rescore triggered', prospectId: payload.prospectId });
    } else if (payload.intent === 'PAS_MAINTENANT') {
      // Continue with slower cadence — just log; rate limiting handles the rest
      this.logger.log({ msg: 'PAS_MAINTENANT — nurture continues with slow cadence', prospectId: payload.prospectId });
    } else if (payload.intent === 'STOP') {
      // Exit sequence and blacklist
      const nurtureSequence = await this.prisma.nurtureProspect.findFirst({
        where: { prospectId: payload.prospectId, status: { not: 'exited' } },
        select: { id: true },
      });
      if (nurtureSequence) {
        await this.prisma.nurtureProspect.update({
          where: { id: nurtureSequence.id },
          data: { status: 'exited', exitReason: 'reply_stop' },
        });
      }
      await this.prisma.prospect.update({
        where: { id: payload.prospectId },
        data: { status: 'unsubscribed' },
      });
      const prospect = await this.prisma.prospect.findUnique({
        where: { id: payload.prospectId },
        select: { email: true },
      });
      if (prospect?.email) {
        const existing = await this.prisma.rgpdBlacklist.findFirst({ where: { email: prospect.email } });
        if (!existing) {
          await this.prisma.rgpdBlacklist.create({
            data: { email: prospect.email, reason: 'reply_stop', source: 'nurtureur' },
          });
        }
      }
      this.logger.log({ msg: 'STOP reply — nurture exited and blacklisted', prospectId: payload.prospectId });
    }

    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'reply_classified_handled',
      prospectId: payload.prospectId,
      payload: { intent: payload.intent },
    });
  }

  // ---------------------------------------------------------------------------
  // 7. mailgun.unsubscribed — Webhook integration
  // ---------------------------------------------------------------------------
  @OnEvent('mailgun.unsubscribed')
  async handleMailgunUnsubscribed(payload: { email: string }): Promise<void> {
    this.logger.log({ msg: 'mailgun.unsubscribed received', email: payload.email });

    const prospect = await this.prisma.prospect.findFirst({
      where: { email: payload.email },
      select: { id: true },
    });

    if (!prospect) return;

    // Exit ALL active nurture sequences for this email
    await this.prisma.nurtureProspect.updateMany({
      where: { prospectId: prospect.id, status: { not: 'exited' } },
      data: { status: 'exited', exitReason: 'mailgun_unsubscribed' },
    });

    await this.prisma.prospect.update({
      where: { id: prospect.id },
      data: { status: 'unsubscribed' },
    });

    // Add to RGPD blacklist
    const existing = await this.prisma.rgpdBlacklist.findFirst({ where: { email: payload.email } });
    if (!existing) {
      await this.prisma.rgpdBlacklist.create({
        data: { email: payload.email, reason: 'mailgun_unsubscribed', source: 'nurtureur' },
      });
    }

    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'mailgun_unsubscribed_handled',
      prospectId: prospect.id,
      payload: { email: payload.email },
    });
  }

  // ---------------------------------------------------------------------------
  // 8. company.bankrupt — From Agent 1 Veilleur
  // ---------------------------------------------------------------------------
  @OnEvent('company.bankrupt')
  async handleCompanyBankrupt(payload: { companySiren: string; companyName?: string }): Promise<void> {
    this.logger.log({ msg: 'company.bankrupt received', ...payload });

    // Find all prospects from this company
    const prospects = await this.prisma.prospect.findMany({
      where: { companySiren: payload.companySiren },
      select: { id: true, email: true },
    });

    if (prospects.length === 0) return;

    const prospectIds = prospects.map((p) => p.id);

    // Exit ALL nurture sequences for this company
    await this.prisma.nurtureProspect.updateMany({
      where: { prospectId: { in: prospectIds }, status: { not: 'exited' } },
      data: { status: 'exited', exitReason: 'company_bankrupt' },
    });

    await this.prisma.prospect.updateMany({
      where: { id: { in: prospectIds } },
      data: { status: 'blacklisted' },
    });

    // Permanent blacklist for each email
    for (const prospect of prospects) {
      if (prospect.email) {
        const existing = await this.prisma.rgpdBlacklist.findFirst({ where: { email: prospect.email } });
        if (!existing) {
          await this.prisma.rgpdBlacklist.create({
            data: {
              email: prospect.email,
              companySiren: payload.companySiren,
              reason: 'company_bankrupt',
              source: 'veilleur',
            },
          });
        }
      }
    }

    this.logger.log({ msg: 'company.bankrupt handled', siren: payload.companySiren, affectedProspects: prospects.length });
    await this.agentEventLogger.log({
      agentName: 'nurtureur',
      eventType: 'company_bankrupt_handled',
      payload: { companySiren: payload.companySiren, affectedProspects: prospects.length },
    });
  }
}
