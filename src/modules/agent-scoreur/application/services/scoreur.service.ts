import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IProspectScoreRepository } from '../../domain/repositories/i-prospect-score.repository';
import { ProspectScore } from '../../domain/entities/prospect-score.entity';
import { CalculateScoreDto } from '../dtos/calculate-score.dto';

const MODEL_VERSION = '1.0.0';

const DEFAULT_COEFFICIENTS = {
  firmographic: 0.3,
  technographic: 0.2,
  behavioral: 0.2,
  engagement: 0.15,
  intent: 0.15,
};

@Injectable()
export class ScoreurService {
  private readonly logger = new Logger(ScoreurService.name);

  constructor(
    private readonly prospectScoreRepository: IProspectScoreRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async calculateScore(dto: CalculateScoreDto): Promise<ProspectScore> {
    this.logger.log({ msg: 'Calculating prospect score', prospectId: dto.prospectId });

    // Deterministic scoring — no external API calls
    // TODO: fetch prospect data from ProspectsModule repository
    const firmographicScore = 50;
    const technographicScore = 50;
    const behavioralScore = 50;
    const engagementScore = 50;
    const intentScore = 50;
    const accessibilityScore = 50;

    const totalScore = Math.round(
      firmographicScore * DEFAULT_COEFFICIENTS.firmographic +
        technographicScore * DEFAULT_COEFFICIENTS.technographic +
        behavioralScore * DEFAULT_COEFFICIENTS.behavioral +
        engagementScore * DEFAULT_COEFFICIENTS.engagement +
        intentScore * DEFAULT_COEFFICIENTS.intent,
    );

    const segment = this.determineSegment(totalScore);

    const score = ProspectScore.create({
      prospectId: dto.prospectId,
      totalScore,
      firmographicScore,
      technographicScore,
      behavioralScore,
      engagementScore,
      intentScore,
      accessibilityScore,
      segment,
      isLatest: true,
      modelVersion: MODEL_VERSION,
    });

    const saved = await this.prospectScoreRepository.save(score);
    this.eventEmitter.emit('prospect.scored', {
      prospectId: dto.prospectId,
      score: totalScore,
      segment,
    });

    this.logger.log({ msg: 'Score calculated', prospectId: dto.prospectId, totalScore, segment });
    return saved;
  }

  async getScoresByProspectId(prospectId: string): Promise<ProspectScore[]> {
    return this.prospectScoreRepository.findByProspectId(prospectId);
  }

  private determineSegment(score: number): string {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    return 'D';
  }
}
