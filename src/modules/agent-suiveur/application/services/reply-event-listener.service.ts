import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Injectable()
export class ReplyEventListenerService {
  private readonly logger = new Logger(ReplyEventListenerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
    @InjectQueue(QUEUE_NAMES.NURTURER_PIPELINE) private readonly nurturerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ENRICHISSEUR_PIPELINE) private readonly enrichisseurQueue: Queue,
  ) {}

  @OnEvent('reply.interested')
  async handleInterested(payload: { prospectId: string; sequenceId: string }) {
    this.logger.log({ msg: 'INTERESSE reply — escalating', prospectId: payload.prospectId });

    // Stop sequence
    await this.stopSequence(payload.sequenceId, 'reply_interested');

    // Update prospect status
    await this.prisma.prospect.update({
      where: { id: payload.prospectId },
      data: { status: 'replied' },
    });

    // TODO: Dispatch to dealmaker-pipeline when Agent 8 is wired
    // TODO: Slack notification to Jonathan

    await this.agentEventLogger.log({
      agentName: 'suiveur', eventType: 'reply_action_interested',
      prospectId: payload.prospectId, payload: { action: 'escalated' },
    });
  }

  @OnEvent('reply.soft_interest')
  async handleSoftInterest(payload: { prospectId: string; sequenceId: string }) {
    this.logger.log({ msg: 'INTERESSE_SOFT reply — pausing sequence', prospectId: payload.prospectId });
    await this.pauseSequence(payload.sequenceId, 'soft_interest');
  }

  @OnEvent('reply.not_now')
  async handleNotNow(payload: { prospectId: string; sequenceId: string }) {
    this.logger.log({ msg: 'PAS_MAINTENANT reply — sending to nurtureur in 30 days', prospectId: payload.prospectId });

    await this.stopSequence(payload.sequenceId, 'reply_not_now');

    // Dispatch to nurtureur with 30-day delay
    await this.nurturerQueue.add('nurture-prospect', {
      prospectId: payload.prospectId,
      reason: 'Reply: pas maintenant — re-engage in 30 days',
      category: 'WARM',
    }, { delay: 30 * 24 * 60 * 60 * 1000 }); // 30 days
  }

  @OnEvent('reply.not_interested')
  async handleNotInterested(payload: { prospectId: string; sequenceId: string }) {
    this.logger.log({ msg: 'PAS_INTERESSE reply — stopping', prospectId: payload.prospectId });

    await this.stopSequence(payload.sequenceId, 'reply_not_interested');

    await this.prisma.prospect.update({
      where: { id: payload.prospectId },
      data: { status: 'lost' },
    });
  }

  @OnEvent('reply.wrong_person')
  async handleWrongPerson(payload: { prospectId: string; sequenceId: string }) {
    this.logger.log({ msg: 'MAUVAISE_PERSONNE reply — re-enriching', prospectId: payload.prospectId });

    await this.stopSequence(payload.sequenceId, 'reply_wrong_person');

    // Dispatch to enrichisseur for re-enrichment with new contact
    await this.enrichisseurQueue.add('enrich-lead', {
      leadId: payload.prospectId,
      source: 're-enrichment',
      preScore: 50,
    });
  }

  @OnEvent('reply.info_request')
  async handleInfoRequest(payload: { prospectId: string; sequenceId: string }) {
    this.logger.log({ msg: 'DEMANDE_INFO reply — pausing for manual follow-up', prospectId: payload.prospectId });
    await this.pauseSequence(payload.sequenceId, 'info_request');
    // TODO: Create manual task for sales team
  }

  @OnEvent('reply.out_of_office')
  async handleOutOfOffice(payload: { prospectId: string; sequenceId: string }) {
    this.logger.log({ msg: 'OUT_OF_OFFICE reply — pausing sequence', prospectId: payload.prospectId });
    await this.pauseSequence(payload.sequenceId, 'out_of_office');
    // TODO: Parse return date and schedule resume
  }

  private async stopSequence(sequenceId: string, reason: string): Promise<void> {
    if (!sequenceId) return;
    await this.prisma.prospectSequence.update({
      where: { id: sequenceId },
      data: { status: 'stopped', stoppedReason: reason },
    }).catch(() => { /* sequence may not exist */ });
  }

  private async pauseSequence(sequenceId: string, reason: string): Promise<void> {
    if (!sequenceId) return;
    await this.prisma.prospectSequence.update({
      where: { id: sequenceId },
      data: { status: 'paused', pausedAt: new Date(), stoppedReason: reason },
    }).catch(() => { /* sequence may not exist */ });
  }
}
