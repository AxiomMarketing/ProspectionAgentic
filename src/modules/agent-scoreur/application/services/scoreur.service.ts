import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash } from 'crypto';
import { PrismaService } from '@core/database/prisma.service';
import { IProspectScoreRepository } from '../../domain/repositories/i-prospect-score.repository';
import { ProspectScore } from '../../domain/entities/prospect-score.entity';
import { CalculateScoreDto } from '../dtos/calculate-score.dto';
import { ScoringEngine, ScoringInput } from './scoring-engine';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

const MODEL_VERSION = '2.0.0';
const IDEMPOTENCY_WINDOW_MS = 60_000; // 60 seconds

@Injectable()
export class ScoreurService {
  private readonly logger = new Logger(ScoreurService.name);

  constructor(
    private readonly prospectScoreRepository: IProspectScoreRepository,
    private readonly scoringEngine: ScoringEngine,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.REDACTEUR_PIPELINE) private readonly redacteurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NURTURER_PIPELINE) private readonly nurturerQueue: Queue,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  async calculateScore(dto: CalculateScoreDto): Promise<ProspectScore> {
    this.logger.log({ msg: 'Calculating prospect score', prospectId: dto.prospectId });

    // 1. Load prospect
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: dto.prospectId },
    });
    if (!prospect) throw new NotFoundException(`Prospect ${dto.prospectId} not found`);

    // S10: Idempotency — skip if scored recently with same data
    const dataHash = this.computeDataHash(prospect);
    const recentScore = await this.prisma.prospectScore.findFirst({
      where: {
        prospectId: dto.prospectId,
        modelVersion: MODEL_VERSION,
        calculatedAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
      },
      orderBy: { calculatedAt: 'desc' },
    });
    if (recentScore) {
      this.logger.log({ msg: 'Idempotency: score exists within window, skipping', prospectId: dto.prospectId });
      return ProspectScore.reconstitute({
        id: recentScore.id,
        prospectId: recentScore.prospectId,
        totalScore: recentScore.totalScore,
        firmographicScore: recentScore.firmographicScore,
        technographicScore: recentScore.technographicScore,
        behavioralScore: recentScore.behavioralScore,
        engagementScore: recentScore.engagementScore,
        intentScore: recentScore.intentScore,
        accessibilityScore: recentScore.accessibilityScore,
        segment: recentScore.segment ?? '',
        isLatest: recentScore.isLatest,
        modelVersion: recentScore.modelVersion,
        calculatedAt: recentScore.calculatedAt,
      });
    }

    // 2. S5: Validate enrichmentData with safe extraction
    const enrichmentData = this.safeParseEnrichmentData(prospect.enrichmentData);
    const techStack = prospect.companyTechStack as Record<string, unknown> | null;

    // S6+S9: Extract and validate signals (reject NaN dates, dedup, reject future)
    const signals = this.extractSignals(enrichmentData);

    // 3. Build ScoringInput — B5 fix: emailInvalid → emailBounced
    const input: ScoringInput = {
      companySize: prospect.companySize ?? undefined,
      industry: enrichmentData?.industry as string | undefined,
      region: enrichmentData?.region as string | undefined,
      signals,
      lighthouseScore: typeof enrichmentData?.lighthouseScore === 'number' ? enrichmentData.lighthouseScore : undefined,
      hasModernFramework: techStack?.['hasModernFramework'] as boolean | undefined,
      hasMobileOptimization: techStack?.['hasMobileOptimization'] as boolean | undefined,
      hasSecurityCerts: techStack?.['hasSecurityCerts'] as boolean | undefined,
      emailVerified: prospect.emailVerified,
      phoneAvailable: !!prospect.phone,
      hasLinkedinProfile: !!prospect.linkedinUrl,
      websiteTraffic: typeof enrichmentData?.websiteTraffic === 'number' ? enrichmentData.websiteTraffic : undefined,
      segment: enrichmentData?.segment as string | undefined,
      isCompetitor: enrichmentData?.isCompetitor === true,
      isOptedOut: !prospect.consentGiven,
      isRgpdBlocked: !!prospect.rgpdErasedAt,
      isBankrupt: enrichmentData?.isBankrupt === true,
      // B5 fix: only disqualify if email exists AND bounced, NOT if email absent
      emailInvalid: !!prospect.email && !prospect.emailVerified && enrichmentData?.emailInvalid === true,
      // C09: Map all enrichmentData fields to ScoringInput
      nafCode: (enrichmentData?.nafCode ?? enrichmentData?.naf ?? '') as string,
      jobTitle: (enrichmentData?.jobTitle ?? enrichmentData?.decideur_role ?? prospect.jobTitle ?? '') as string,
      stackObsolete: (enrichmentData?.stackObsolete ?? (Array.isArray(enrichmentData?.techStack) && (enrichmentData.techStack as string[]).includes('jQuery'))) as boolean | undefined,
      rgaaViolationsCritical: (enrichmentData?.rgaaViolationsCritical ?? 0) as number,
      rgaaCompliant: (enrichmentData?.rgaaCompliant ?? false) as boolean,
      caAnnuel: (enrichmentData?.caAnnuel ?? enrichmentData?.chiffreAffaires ?? 0) as number,
      croissanceCaPct: (enrichmentData?.croissanceCaPct ?? 0) as number,
      effectifEnBaisse: (enrichmentData?.effectifEnBaisse ?? false) as boolean,
      emailCatchAll: (enrichmentData?.emailCatchAll ?? false) as boolean,
      emailPersonnel: (enrichmentData?.emailPersonnel ?? false) as boolean,
      decideurIdentifie: (enrichmentData?.decideurIdentifie ?? !!enrichmentData?.contactEmail) as boolean,
      completudePct: (enrichmentData?.completudePct ?? enrichmentData?.completude ?? 0) as number,
      bodaccNegatif: (enrichmentData?.bodaccNegatif ?? enrichmentData?.hasProcedureCollective ?? false) as boolean,
      ecommercePlatform: (enrichmentData?.ecommercePlatform ?? '') as string,
      hasAppelOffre: (enrichmentData?.hasAppelOffre ?? false) as boolean,
      isReferral: (enrichmentData?.isReferral ?? false) as boolean,
      entrepriseFermee: (enrichmentData?.entrepriseFermee ?? (enrichmentData?.isActive === false)) as boolean,
    };

    // 4. Calculate score
    const result = this.scoringEngine.calculate(input);

    // 5. Save ProspectScore — B6 fix: use lighthouseScore for accessibility
    // C11 fix: segment holds the business segment; category is stored in scoreBreakdown
    const businessSegment = (enrichmentData?.segment as string | undefined) ?? '';
    const score = ProspectScore.create({
      prospectId: dto.prospectId,
      totalScore: result.totalScore,
      firmographicScore: result.breakdown.icpFitNormalized,
      technographicScore: result.breakdown.stackTechniqueNormalized,
      behavioralScore: result.breakdown.signalsIntentionNormalized,
      engagementScore: result.breakdown.engagementNormalized,
      intentScore: result.breakdown.signalsIntention,
      accessibilityScore: typeof enrichmentData?.lighthouseScore === 'number'
        ? Math.round((100 - (enrichmentData.lighthouseScore as number)) / 100 * 15)
        : 0,
      segment: businessSegment,
      category: result.category,
      isLatest: true,
      modelVersion: MODEL_VERSION,
    });

    const saved = await this.prospectScoreRepository.save(score);

    // B7: Update Prospect.status to 'scored'
    await this.prisma.prospect.update({
      where: { id: dto.prospectId },
      data: { status: 'scored' },
    });

    // 6. Dispatch to appropriate queue
    const category = result.category;

    if (category === 'HOT_A' || category === 'HOT_B' || category === 'HOT_C') {
      await this.redacteurQueue.add(
        'generate-message',
        {
          prospectId: dto.prospectId,
          channel: 'email' as const,
          category,
          routing: result.routing,
          breakdown: result.breakdown,
        },
        { delay: result.routing.delayMs, priority: result.routing.priority },
      );
      if (category === 'HOT_A' || category === 'HOT_B') {
        await this.redacteurQueue.add(
          'generate-message',
          {
            prospectId: dto.prospectId,
            channel: 'linkedin' as const,
            category,
            routing: result.routing,
            breakdown: result.breakdown,
          },
          {
            delay: result.routing.delayMs + 3600000,
            priority: result.routing.priority - 10,
          },
        );
      }
    } else if (category === 'WARM' || category === 'COLD') {
      await this.nurturerQueue.add(
        'nurture-prospect',
        {
          prospectId: dto.prospectId,
          reason: `Scored as ${category}`,
          category,
          routing: result.routing,
        },
        { delay: result.routing.delayMs, priority: result.routing.priority },
      );
    }

    // 7. Events + logging
    this.eventEmitter.emit('prospect.scored', {
      prospectId: dto.prospectId,
      score: result.totalScore,
      category,
    });

    await this.agentEventLogger.log({
      agentName: 'scoreur',
      eventType: 'prospect_scored',
      prospectId: dto.prospectId,
      payload: { score: result.totalScore, segment: result.category, dataHash },
    });

    return saved;
  }

  async getScoresByProspectId(prospectId: string): Promise<ProspectScore[]> {
    return this.prospectScoreRepository.findByProspectId(prospectId);
  }

  // S5: Safe parse enrichmentData — don't trust JSON types
  private safeParseEnrichmentData(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object') return null;
    return data as Record<string, unknown>;
  }

  // S6+S9: Extract signals with validation + dedup
  private extractSignals(enrichmentData: Record<string, unknown> | null): ScoringInput['signals'] {
    if (!enrichmentData?.['signals']) return [];
    const raw = enrichmentData['signals'];
    if (!Array.isArray(raw)) return [];

    const seen = new Set<string>();
    return raw
      .filter((s) => {
        if (!s || typeof s !== 'object' || !s.type || !s.date || !s.source) return false;
        const d = new Date(s.date as string);
        // S6: Reject invalid dates and future dates
        if (isNaN(d.getTime()) || d.getTime() > Date.now()) return false;
        // S9: Deduplicate by (type, date, source)
        const key = `${s.type}:${d.toISOString()}:${s.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((s) => ({
        type: String(s.type),
        date: new Date(s.date as string),
        source: String(s.source),
      }));
  }

  // S10: Compute hash of scoring-relevant prospect data for idempotency
  private computeDataHash(prospect: any): string {
    const relevant = {
      companySize: prospect.companySize,
      enrichmentData: prospect.enrichmentData,
      companyTechStack: prospect.companyTechStack,
      emailVerified: prospect.emailVerified,
      phone: prospect.phone,
      linkedinUrl: prospect.linkedinUrl,
      email: prospect.email,
      consentGiven: prospect.consentGiven,
    };
    return createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16);
  }
}
