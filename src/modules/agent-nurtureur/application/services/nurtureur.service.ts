import { Injectable, Logger, NotFoundException, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { INurtureSequenceRepository } from '../../domain/repositories/i-nurture-sequence.repository';
import { NurtureSequence, NurtureStatus } from '../../domain/entities/nurture-sequence.entity';
import { StartNurtureDto } from '../dtos/start-nurture.dto';
import { PrismaService } from '@core/database/prisma.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { ReScorerService } from './re-scorer.service';

// NurtureEmailService is created by task #6 — use token-based optional injection
// to avoid circular dependency at import time
export const NURTURE_EMAIL_SERVICE_TOKEN = 'NURTURE_EMAIL_SERVICE';

@Injectable()
export class NurtureurService {
  private readonly logger = new Logger(NurtureurService.name);

  constructor(
    private readonly nurtureSequenceRepository: INurtureSequenceRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCOREUR_PIPELINE) private readonly scoreurQueue: Queue,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly configService: ConfigService,
    @Optional() @Inject(NURTURE_EMAIL_SERVICE_TOKEN) private readonly nurtureEmailService: any,
    @Optional() private readonly reScorerService: ReScorerService,
  ) {}

  // ---------------------------------------------------------------------------
  // RGPD gate (S1 + S2 + S3)
  // ---------------------------------------------------------------------------
  private async rgpdGate(prospectId: string): Promise<{ allowed: boolean; reason?: string }> {
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { status: true, email: true, rgpdErasedAt: true },
    });
    if (!prospect) return { allowed: false, reason: 'PROSPECT_NOT_FOUND' };
    if (prospect.rgpdErasedAt) return { allowed: false, reason: 'RGPD_ERASED' };

    // Check optOutAt from NurtureProspect (where it actually lives in the schema)
    const nurtureRecord = await this.prisma.nurtureProspect.findFirst({
      where: { prospectId },
      select: { optOutAt: true },
    });
    if (nurtureRecord?.optOutAt) return { allowed: false, reason: 'OPT_OUT' };

    if (['blacklisted', 'unsubscribed', 'excluded'].includes(prospect.status)) {
      return { allowed: false, reason: `STATUS_${prospect.status.toUpperCase()}` };
    }
    const blacklisted = await this.prisma.rgpdBlacklist.findFirst({ where: { email: prospect.email } });
    if (blacklisted) return { allowed: false, reason: 'BLACKLISTED' };
    return { allowed: true };
  }

  // ---------------------------------------------------------------------------
  // Rate limiting gate (S10)
  // ---------------------------------------------------------------------------
  private async canSendNurtureEmail(prospectId: string): Promise<boolean> {
    const nurture = await this.prisma.nurtureProspect.findFirst({
      where: { prospectId, status: 'active' },
    });
    if (!nurture) return false;
    // Min N days between emails
    if (nurture.lastEmailSentAt) {
      const daysSince = (Date.now() - nurture.lastEmailSentAt.getTime()) / 86400000;
      const minDays = this.configService.get<number>('NURTUREUR_MIN_DAYS_BETWEEN_EMAILS', 3);
      if (daysSince < minDays) return false;
    }
    // Max N emails/week
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const count = await this.prisma.nurtureInteraction.count({
      where: { prospectId, channel: 'email', createdAt: { gte: weekAgo } },
    });
    const maxPerWeek = this.configService.get<number>('NURTUREUR_MAX_EMAILS_PER_WEEK', 2);
    return count < maxPerWeek;
  }

  // ---------------------------------------------------------------------------
  // startNurture — B1 (set prospect.status) + B3 (dedup) + S1-S3 (RGPD gate)
  // ---------------------------------------------------------------------------
  async startNurture(dto: StartNurtureDto): Promise<NurtureSequence> {
    // S1-S3 — RGPD gate at entry
    const gate = await this.rgpdGate(dto.prospectId);
    if (!gate.allowed) {
      this.logger.warn({ msg: 'startNurture blocked by RGPD gate', prospectId: dto.prospectId, reason: gate.reason });
      throw new Error(`RGPD gate blocked nurture start: ${gate.reason}`);
    }

    // B3 — check for existing active sequence to avoid P2002 crash
    const existing = await this.nurtureSequenceRepository.findActiveByProspectId(dto.prospectId);
    if (existing) {
      this.logger.log({ msg: 'Active sequence exists — merging reason', prospectId: dto.prospectId });
      const merged = existing.addReason(dto.reason);
      await this.nurtureSequenceRepository.update(merged);
      return merged;
    }

    this.logger.log({ msg: 'Starting nurture sequence', prospectId: dto.prospectId });

    let saved: NurtureSequence;
    try {
      const sequence = NurtureSequence.create(dto.prospectId, dto.reason);
      saved = await this.nurtureSequenceRepository.save(sequence);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // Race condition: another request created the sequence concurrently
        this.logger.warn({ msg: 'Concurrent startNurture detected (P2002)', prospectId: dto.prospectId });
        const concurrent = await this.nurtureSequenceRepository.findActiveByProspectId(dto.prospectId);
        if (!concurrent) throw new Error(`Concurrent startNurture but no active sequence found for ${dto.prospectId}`);
        return concurrent;
      }
      throw error;
    }

    // B1 — set prospect status to 'nurturing'
    await this.prisma.prospect.update({
      where: { id: dto.prospectId },
      data: { status: 'nurturing' },
    });

    this.eventEmitter.emit('nurture.started', {
      sequenceId: saved.id,
      prospectId: saved.prospectId,
    });
    await this.agentEventLogger.log({ agentName: 'nurtureur', eventType: 'nurture_started', prospectId: saved.prospectId });
    return saved;
  }

  async pauseNurture(id: string): Promise<NurtureSequence> {
    const sequence = await this.nurtureSequenceRepository.findById(id);
    if (!sequence) throw new NotFoundException(`NurtureSequence ${id} not found`);
    const paused = sequence.pause();
    return this.nurtureSequenceRepository.update(paused);
  }

  async reactivateProspect(id: string): Promise<NurtureSequence> {
    const sequence = await this.nurtureSequenceRepository.findById(id);
    if (!sequence) throw new NotFoundException(`NurtureSequence ${id} not found`);
    const reactivated = sequence.reactivate();
    this.eventEmitter.emit('nurture.reactivated', {
      sequenceId: id,
      prospectId: sequence.prospectId,
    });
    return this.nurtureSequenceRepository.update(reactivated);
  }

  // ---------------------------------------------------------------------------
  // processNurtureStep — B4 (delegate to NurtureEmailService) + B5 (rescore) +
  //                      B8 (nurture-specific email count) + S1-S3 (RGPD gate)
  // ---------------------------------------------------------------------------
  async processNurtureStep(prospectId: string): Promise<void> {
    this.logger.log({ msg: 'Processing nurture step', prospectId });

    // S1-S3 — RGPD gate before any email action
    const gate = await this.rgpdGate(prospectId);
    if (!gate.allowed) {
      this.logger.warn({ msg: 'processNurtureStep blocked by RGPD gate', prospectId, reason: gate.reason });
      return;
    }

    const sequence = await this.nurtureSequenceRepository.findByProspectId(prospectId);
    if (!sequence) {
      this.logger.warn({ msg: 'No active nurture sequence found', prospectId });
      return;
    }

    // B8 — count only nurture-specific email interactions
    const nurtureEmailsSent = await this.prisma.nurtureInteraction.count({
      where: {
        prospectId,
        channel: 'email',
        interactionType: { startsWith: 'nurture' },
      },
    });

    // S10 — rate limiting gate
    const canSend = await this.canSendNurtureEmail(prospectId);
    if (!canSend) {
      this.logger.log({ msg: 'Rate limit reached for nurture email', prospectId });
      return;
    }

    // B4 — delegate to NurtureEmailService if available
    if (this.nurtureEmailService) {
      try {
        await this.nurtureEmailService.sendNurtureEmail({
          prospectId,
          sequenceId: sequence.id,
          stepType: nurtureEmailsSent > 0 ? 'linkedin_engagement' : 'email_content',
        });
      } catch (err: any) {
        this.logger.error({ msg: 'NurtureEmailService.sendNurtureEmail failed', prospectId, error: err?.message });
        // Fall back to event emission so downstream listeners still fire
        this.eventEmitter.emit('nurture.step.processed', {
          sequenceId: sequence.id,
          prospectId,
          stepType: nurtureEmailsSent > 0 ? 'linkedin_engagement' : 'email_content',
        });
      }
    } else {
      // NurtureEmailService not yet wired — fall back to event emission
      this.logger.warn({ msg: 'NurtureEmailService not available, falling back to event emission', prospectId });
      this.eventEmitter.emit('nurture.step.processed', {
        sequenceId: sequence.id,
        prospectId,
        stepType: nurtureEmailsSent > 0 ? 'linkedin_engagement' : 'email_content',
      });
    }

    // B5 — trigger re-score when engagement crosses threshold
    const rescoreThreshold = this.configService.get<number>('NURTUREUR_RESCORE_THRESHOLD', 75);
    if (sequence.engagementScoreCurrent >= rescoreThreshold) {
      await this.triggerReScore(prospectId);
    }

    this.logger.log({ msg: 'Nurture step processed', prospectId, sequenceId: sequence.id });
  }

  // ---------------------------------------------------------------------------
  // checkReEngagement — B7 (use NurtureProspect.lastInteractionAt)
  // ---------------------------------------------------------------------------
  async checkReEngagement(): Promise<void> {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // B7 — query by NurtureProspect.lastInteractionAt, not prospect.updatedAt
    const inactiveNurtures = await this.prisma.nurtureProspect.findMany({
      where: {
        status: { notIn: ['exited'] },
        OR: [
          { lastInteractionAt: { lt: sixtyDaysAgo } },
          { lastInteractionAt: null, updatedAt: { lt: sixtyDaysAgo } },
        ],
      },
      select: { prospectId: true, status: true },
      take: 100,
    });

    this.logger.log({ msg: 'Re-engagement check', count: inactiveNurtures.length });

    if (inactiveNurtures.length === 0) return;

    for (const nurture of inactiveNurtures) {
      if (nurture.status === undefined || nurture.status === 'exited') {
        await this.startNurture({ prospectId: nurture.prospectId, reason: 're_engagement_60d' });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // checkSunset — B2 (update prospect.status + RgpdBlacklist)
  //               C19/C20: differentiated gates by consentBasis
  // ---------------------------------------------------------------------------
  async checkSunset(): Promise<void> {
    // Fetch all active records — filter per consentBasis below
    const oldEnoughAgo = new Date();
    oldEnoughAgo.setDate(oldEnoughAgo.getDate() - 30); // minimum window is consent=30d

    const candidateRecords = await this.prisma.nurtureProspect.findMany({
      where: {
        entryDate: { lt: oldEnoughAgo },
        status: { not: 'exited' },
      },
      include: {
        prospect: { select: { email: true } },
      },
      take: 100,
    });

    this.logger.log({ msg: 'Sunset check', count: candidateRecords.length });

    for (const record of candidateRecords) {
      const consentBasis = (record.consentBasis ?? 'legitimate_interest') as string;
      const maxDays = consentBasis === 'consent' ? 30
        : consentBasis === 'legitimate_interest' ? 90
        : 180; // pre_contractual

      const daysInNurture = Math.floor((Date.now() - record.entryDate.getTime()) / 86400000);

      // C20 — re-permission check at day 85 for legitimate_interest
      if (consentBasis === 'legitimate_interest' && daysInNurture >= 85 && daysInNurture < 90) {
        const alreadySent = (record as any).rePermissionSent as boolean | null;
        if (!alreadySent) {
          this.logger.log({ msg: 'Sending re-permission email (J-85/90)', prospectId: record.prospectId });

          if (this.nurtureEmailService) {
            try {
              await this.nurtureEmailService.sendNurtureEmail({
                prospectId: record.prospectId,
                sequenceId: record.id,
                stepType: 're_permission',
              });
            } catch (err: any) {
              this.logger.error({ msg: 'Re-permission email failed', prospectId: record.prospectId, error: err?.message });
            }
          } else {
            this.eventEmitter.emit('nurture.re_permission.needed', { prospectId: record.prospectId, sequenceId: record.id });
          }

          await (this.prisma as any).nurtureProspect.update({
            where: { id: record.id },
            data: { rePermissionSent: true },
          });
        }
      }

      // C19 — exit if past maxDays for this consentBasis
      if (daysInNurture <= maxDays) continue;

      const exitReason = `rgpd_sunset_${maxDays}d_${consentBasis}`;

      const sequence = NurtureSequence.reconstitute({
        id: record.id,
        prospectId: record.prospectId,
        entryReason: record.entryReason,
        entryDate: record.entryDate,
        status: record.status as NurtureStatus,
        reactivatedAt: record.reactivatedAt ?? undefined,
        exitReason: record.exitReason ?? undefined,
        tags: record.tags as string[],
        currentStep: record.currentStep ?? 0,
        totalSteps: record.totalSteps ?? 12,
        journeyStage: (record.journeyStage as any) ?? 'awareness',
        engagementScoreInitial: record.engagementScoreInitial ?? 0,
        engagementScoreCurrent: record.engagementScoreCurrent ?? 0,
        emailsNurtureSent: record.emailsNurtureSent ?? 0,
        emailsOpened: record.emailsOpened ?? 0,
        emailsClicked: record.emailsClicked ?? 0,
        repliesReceived: record.repliesReceived ?? 0,
        contentDownloaded: record.contentDownloaded ?? 0,
        consecutiveUnopened: record.consecutiveUnopened ?? 0,
        consentBasis: record.consentBasis ?? 'legitimate_interest',
        lastInteractionAt: record.lastInteractionAt ?? undefined,
        lastEmailSentAt: record.lastEmailSentAt ?? undefined,
      });

      const exited = sequence.exit(exitReason);
      await this.nurtureSequenceRepository.update(exited);

      // B2 — update prospect status to 'unsubscribed'
      await this.prisma.prospect.update({
        where: { id: record.prospectId },
        data: { status: 'unsubscribed' },
      });

      // B2 — add to RGPD blacklist to prevent re-enrollment
      if (record.prospect?.email) {
        const existingBlacklist = await this.prisma.rgpdBlacklist.findFirst({
          where: { email: record.prospect.email },
        });
        if (!existingBlacklist) {
          await this.prisma.rgpdBlacklist.create({
            data: { email: record.prospect.email, reason: exitReason, source: 'nurtureur' },
          });
        }
      }

      this.eventEmitter.emit('nurture.exited', {
        sequenceId: sequence.id,
        prospectId: sequence.prospectId,
        reason: exitReason,
      });
    }
  }

  async triggerReScore(prospectId: string): Promise<void> {
    this.logger.log({ msg: 'Triggering re-score', prospectId });

    await this.scoreurQueue.add('score-prospect', { prospectId, trigger: 'nurture_engagement' });

    this.eventEmitter.emit('nurture.rescore.triggered', { prospectId });
  }
}
