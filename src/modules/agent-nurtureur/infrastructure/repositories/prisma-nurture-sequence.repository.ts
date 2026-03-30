import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { INurtureSequenceRepository } from '../../domain/repositories/i-nurture-sequence.repository';
import { NurtureSequence, NurtureSequenceProps, NurtureStatus, SequenceType, ScoringCategorie, JourneyStage } from '../../domain/entities/nurture-sequence.entity';
import { NurtureProspect as PrismaNurtureProspect } from '@prisma/client';

@Injectable()
export class PrismaNurtureSequenceRepository extends INurtureSequenceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaNurtureProspect): NurtureSequence {
    const props: NurtureSequenceProps = {
      id: record.id,
      prospectId: record.prospectId,
      entryReason: record.entryReason,
      entryDate: record.entryDate,
      status: record.status as NurtureStatus,
      reactivatedAt: record.reactivatedAt ?? undefined,
      exitReason: record.exitReason ?? undefined,
      tags: record.tags as string[],

      sequenceType: (record.sequenceType ?? undefined) as SequenceType | undefined,
      currentStep: record.currentStep,
      totalSteps: record.totalSteps,
      segment: record.segment ?? undefined,
      scoringCategorie: (record.scoringCategorie ?? undefined) as ScoringCategorie | undefined,
      journeyStage: (record.journeyStage ?? 'awareness') as JourneyStage,

      engagementScoreInitial: record.engagementScoreInitial,
      engagementScoreCurrent: record.engagementScoreCurrent,
      lastScoreUpdate: record.lastScoreUpdate ?? undefined,

      emailsNurtureSent: record.emailsNurtureSent,
      emailsOpened: record.emailsOpened,
      emailsClicked: record.emailsClicked,
      repliesReceived: record.repliesReceived,
      contentDownloaded: record.contentDownloaded,
      consecutiveUnopened: record.consecutiveUnopened,

      nextEmailScheduledAt: record.nextEmailScheduledAt ?? undefined,
      nextRescoreAt: record.nextRescoreAt ?? undefined,
      lastInteractionAt: record.lastInteractionAt ?? undefined,
      lastEmailSentAt: record.lastEmailSentAt ?? undefined,
      inactiveSince: record.inactiveSince ?? undefined,

      consentBasis: record.consentBasis,
      optOutAt: record.optOutAt ?? undefined,
      dataRetentionUntil: record.dataRetentionUntil ?? undefined,
    };
    return NurtureSequence.reconstitute(props);
  }

  async findById(id: string): Promise<NurtureSequence | null> {
    const record = await this.prisma.nurtureProspect.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByProspectId(prospectId: string): Promise<NurtureSequence | null> {
    const record = await this.prisma.nurtureProspect.findFirst({ where: { prospectId } });
    return record ? this.toDomain(record) : null;
  }

  async findActiveByProspectId(prospectId: string): Promise<NurtureSequence | null> {
    const record = await this.prisma.nurtureProspect.findFirst({
      where: { prospectId, status: { not: 'exited' } },
    });
    return record ? this.toDomain(record) : null;
  }

  async findActive(limit = 50): Promise<NurtureSequence[]> {
    const records = await this.prisma.nurtureProspect.findMany({
      where: { status: 'active' },
      orderBy: { entryDate: 'asc' },
      take: limit,
    });
    return records.map((r) => this.toDomain(r));
  }

  async findExpiredNurture(days: number): Promise<NurtureSequence[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const records = await this.prisma.nurtureProspect.findMany({
      where: {
        status: { not: 'exited' },
        entryDate: { lte: cutoff },
      },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findInactiveProspects(days: number, limit: number): Promise<NurtureSequence[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const records = await this.prisma.nurtureProspect.findMany({
      where: {
        status: { not: 'exited' },
        lastInteractionAt: { lte: cutoff },
      },
      take: limit,
      orderBy: { lastInteractionAt: 'asc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findDueForRescore(): Promise<NurtureSequence[]> {
    const now = new Date();
    const records = await this.prisma.nurtureProspect.findMany({
      where: {
        status: { not: 'exited' },
        nextRescoreAt: { lte: now },
      },
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(sequence: NurtureSequence): Promise<NurtureSequence> {
    const plain = sequence.toPlainObject();
    const record = await this.prisma.nurtureProspect.create({
      data: {
        id: plain.id,
        prospectId: plain.prospectId,
        entryReason: plain.entryReason,
        entryDate: plain.entryDate,
        status: plain.status,
        tags: plain.tags,
        sequenceType: plain.sequenceType ?? null,
        currentStep: plain.currentStep,
        totalSteps: plain.totalSteps,
        segment: plain.segment ?? null,
        scoringCategorie: plain.scoringCategorie ?? null,
        journeyStage: plain.journeyStage,
        engagementScoreInitial: plain.engagementScoreInitial,
        engagementScoreCurrent: plain.engagementScoreCurrent,
        emailsNurtureSent: plain.emailsNurtureSent,
        emailsOpened: plain.emailsOpened,
        emailsClicked: plain.emailsClicked,
        repliesReceived: plain.repliesReceived,
        contentDownloaded: plain.contentDownloaded,
        consecutiveUnopened: plain.consecutiveUnopened,
        consentBasis: plain.consentBasis,
      },
    });
    return this.toDomain(record);
  }

  async update(sequence: NurtureSequence): Promise<NurtureSequence> {
    const plain = sequence.toPlainObject();
    const record = await this.prisma.nurtureProspect.update({
      where: { id: plain.id },
      data: {
        status: plain.status,
        reactivatedAt: plain.reactivatedAt ?? null,
        exitReason: plain.exitReason ?? null,
        tags: plain.tags,
        sequenceType: plain.sequenceType ?? null,
        currentStep: plain.currentStep,
        totalSteps: plain.totalSteps,
        segment: plain.segment ?? null,
        scoringCategorie: plain.scoringCategorie ?? null,
        journeyStage: plain.journeyStage,
        engagementScoreInitial: plain.engagementScoreInitial,
        engagementScoreCurrent: plain.engagementScoreCurrent,
        lastScoreUpdate: plain.lastScoreUpdate ?? null,
        emailsNurtureSent: plain.emailsNurtureSent,
        emailsOpened: plain.emailsOpened,
        emailsClicked: plain.emailsClicked,
        repliesReceived: plain.repliesReceived,
        contentDownloaded: plain.contentDownloaded,
        consecutiveUnopened: plain.consecutiveUnopened,
        nextEmailScheduledAt: plain.nextEmailScheduledAt ?? null,
        nextRescoreAt: plain.nextRescoreAt ?? null,
        lastInteractionAt: plain.lastInteractionAt ?? null,
        lastEmailSentAt: plain.lastEmailSentAt ?? null,
        inactiveSince: plain.inactiveSince ?? null,
        consentBasis: plain.consentBasis,
        optOutAt: plain.optOutAt ?? null,
        dataRetentionUntil: plain.dataRetentionUntil ?? null,
      },
    });
    return this.toDomain(record);
  }
}
