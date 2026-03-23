import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { IProspectScoreRepository } from '../../domain/repositories/i-prospect-score.repository';
import { ProspectScore } from '../../domain/entities/prospect-score.entity';
import { CalculateScoreDto } from '../dtos/calculate-score.dto';
import { ScoringEngine, ScoringInput } from './scoring-engine';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const MODEL_VERSION = '2.0.0';

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
  ) {}

  async calculateScore(dto: CalculateScoreDto): Promise<ProspectScore> {
    this.logger.log({ msg: 'Calculating prospect score', prospectId: dto.prospectId });

    // 1. Load prospect + enrichment data from Prisma
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: dto.prospectId },
    });

    if (!prospect) {
      throw new NotFoundException(`Prospect ${dto.prospectId} not found`);
    }

    // 2. Build ScoringInput from prospect data
    const enrichmentData = prospect.enrichmentData as Record<string, unknown> | null;
    const techStack = prospect.companyTechStack as Record<string, unknown> | null;

    const signals = this.extractSignals(enrichmentData);

    const input: ScoringInput = {
      companySize: prospect.companySize ?? undefined,
      industry: enrichmentData?.['industry'] as string | undefined,
      region: enrichmentData?.['region'] as string | undefined,
      signals,
      lighthouseScore: enrichmentData?.['lighthouseScore'] as number | undefined,
      hasModernFramework: techStack?.['hasModernFramework'] as boolean | undefined,
      hasMobileOptimization: techStack?.['hasMobileOptimization'] as boolean | undefined,
      hasSecurityCerts: techStack?.['hasSecurityCerts'] as boolean | undefined,
      emailVerified: prospect.emailVerified,
      phoneAvailable: !!prospect.phone,
      hasLinkedinProfile: !!prospect.linkedinUrl,
      websiteTraffic: enrichmentData?.['websiteTraffic'] as number | undefined,
      segment: enrichmentData?.['segment'] as string | undefined,
      isCompetitor: enrichmentData?.['isCompetitor'] as boolean | undefined,
      isOptedOut: !prospect.consentGiven,
      isRgpdBlocked: !!prospect.rgpdErasedAt,
      isBankrupt: enrichmentData?.['isBankrupt'] as boolean | undefined,
      emailInvalid:
        !prospect.email || (!prospect.emailVerified && enrichmentData?.['emailInvalid'] === true),
    };

    // 3. Call scoring engine
    const result = this.scoringEngine.calculate(input);

    // 4. Save ProspectScore entity via repository (transaction handled inside repository)
    const score = ProspectScore.create({
      prospectId: dto.prospectId,
      totalScore: result.totalScore,
      firmographicScore: result.breakdown.icpFitNormalized,
      technographicScore: result.breakdown.stackTechniqueNormalized,
      behavioralScore: result.breakdown.signalsIntentionNormalized,
      engagementScore: result.breakdown.engagementNormalized,
      intentScore: result.breakdown.signalsIntention,
      accessibilityScore: result.breakdown.engagementNormalized,
      segment: result.category,
      isLatest: true,
      modelVersion: MODEL_VERSION,
    });

    const saved = await this.prospectScoreRepository.save(score);

    // 5. Dispatch to appropriate queue
    const category = result.category;

    if (category === 'HOT_A' || category === 'HOT_B' || category === 'HOT_C') {
      await this.redacteurQueue.add(
        'generate-message',
        {
          prospectId: dto.prospectId,
          category,
          routing: result.routing,
          breakdown: result.breakdown,
        },
        {
          delay: result.routing.delayMs,
          priority: result.routing.priority,
        },
      );
      this.logger.log({
        msg: 'Dispatched to redacteur pipeline',
        prospectId: dto.prospectId,
        category,
      });
    } else if (category === 'WARM' || category === 'COLD') {
      await this.nurturerQueue.add(
        'nurture-prospect',
        {
          prospectId: dto.prospectId,
          category,
          routing: result.routing,
        },
        {
          delay: result.routing.delayMs,
          priority: result.routing.priority,
        },
      );
      this.logger.log({
        msg: 'Dispatched to nurturer pipeline',
        prospectId: dto.prospectId,
        category,
      });
    }
    // DISQUALIFIE: do not dispatch

    // 6. Emit event
    this.eventEmitter.emit('prospect.scored', {
      prospectId: dto.prospectId,
      score: result.totalScore,
      category,
      routing: result.routing,
    });

    this.logger.log({
      msg: 'Score calculated',
      prospectId: dto.prospectId,
      totalScore: result.totalScore,
      category,
    });
    return saved;
  }

  async getScoresByProspectId(prospectId: string): Promise<ProspectScore[]> {
    return this.prospectScoreRepository.findByProspectId(prospectId);
  }

  private extractSignals(enrichmentData: Record<string, unknown> | null): ScoringInput['signals'] {
    if (!enrichmentData?.['signals']) return [];
    const raw = enrichmentData['signals'];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => s && typeof s === 'object' && s.type && s.date && s.source)
      .map((s) => ({
        type: String(s.type),
        date: new Date(s.date as string),
        source: String(s.source),
      }));
  }
}
