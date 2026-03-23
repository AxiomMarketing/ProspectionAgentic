import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { IMarketDataAdapter, MarketOpportunity } from '@common/ports/i-market-data.adapter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { DetectLeadDto } from '../dtos/detect-lead.dto';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Injectable()
export class VeilleurService {
  private readonly logger = new Logger(VeilleurService.name);

  constructor(
    private readonly rawLeadRepository: IRawLeadRepository,
    private readonly marketDataAdapter: IMarketDataAdapter,
    @InjectQueue(QUEUE_NAMES.ENRICHISSEUR_PIPELINE) private readonly enrichisseurQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async detectLeads(dto: DetectLeadDto): Promise<RawLead[]> {
    this.logger.log({ msg: 'Starting lead detection', source: dto.source, keywords: dto.keywords });

    // 1. Fetch opportunities from market data source
    const opportunities = await this.marketDataAdapter.fetchRecentOpportunities({
      source: dto.source,
      since: new Date(Date.now() - dto.sinceDays * 24 * 60 * 60 * 1000),
      keywords: dto.keywords,
      maxResults: dto.maxResults,
    });

    // 2. Filter by minimum relevance score
    const filtered = opportunities.filter((o) => o.relevanceScore >= dto.minRelevanceScore);

    if (filtered.length === 0) {
      this.logger.log({
        msg: 'No opportunities above threshold',
        total: opportunities.length,
        minScore: dto.minRelevanceScore,
      });
      return [];
    }

    // 3. Batch dedup — single DB query instead of N+1
    const sourceUrls = filtered.map((o) => o.url).filter(Boolean);
    const existingLeads = await this.rawLeadRepository.findBySourceUrls(sourceUrls);
    const existingUrls = new Set(existingLeads.map((l) => l.sourceUrl));

    // 4. Create and save new leads
    const newLeads: RawLead[] = [];
    for (const opp of filtered) {
      if (existingUrls.has(opp.url)) continue;

      const lead = RawLead.create({
        source: dto.source,
        sourceId: opp.url,
        sourceUrl: opp.url,
        rawData: opp.raw,
      });

      const saved = await this.rawLeadRepository.save(lead);
      newLeads.push(saved);

      // 5. Calculate pre-score and dispatch to enrichisseur
      const preScore = this.calculatePreScore(opp);
      await this.dispatchToEnrichisseur(saved.id, dto.source, preScore);

      // 6. Emit domain event
      this.eventEmitter.emit('lead.detected', {
        leadId: saved.id,
        source: dto.source,
        preScore,
        companyName: opp.companyName,
      });
    }

    this.logger.log({
      msg: 'Lead detection complete',
      totalOpportunities: opportunities.length,
      filtered: filtered.length,
      duplicatesSkipped: filtered.length - newLeads.length,
      newLeads: newLeads.length,
    });

    return newLeads;
  }

  async getPendingLeads(limit?: number): Promise<RawLead[]> {
    return this.rawLeadRepository.findPending(limit);
  }

  async getLeadById(id: string): Promise<RawLead | null> {
    return this.rawLeadRepository.findById(id);
  }

  async getLeadStats(): Promise<{
    total: number;
    processed: number;
    pending: number;
    bySource: Record<string, number>;
  }> {
    const [pending] = await Promise.all([this.rawLeadRepository.findPending(0)]);

    // Simple stats — will be enhanced with proper aggregation later
    return {
      total: 0, // TODO: add count() to repository
      processed: 0,
      pending: pending.length,
      bySource: {},
    };
  }

  private calculatePreScore(opportunity: MarketOpportunity): number {
    let score = 0;

    // Signal strength (max 35pts) — based on relevance score
    score += Math.round((opportunity.relevanceScore / 100) * 35);

    // Freshness (max 10pts)
    const daysOld = Math.floor(
      (Date.now() - opportunity.publishedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysOld === 0) score += 10;
    else if (daysOld === 1) score += 8;
    else if (daysOld === 2) score += 6;
    else if (daysOld === 3) score += 4;
    else score += 2;

    // Estimated value bonus (max 15pts)
    if (opportunity.estimatedValue) {
      if (opportunity.estimatedValue >= 100_000) score += 15;
      else if (opportunity.estimatedValue >= 50_000) score += 10;
      else if (opportunity.estimatedValue >= 20_000) score += 5;
    }

    // Deadline proximity bonus (max 10pts) — closer deadline = more urgent
    if (opportunity.deadline) {
      const daysUntilDeadline = Math.floor(
        (opportunity.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilDeadline >= 7 && daysUntilDeadline <= 30) score += 10;
      else if (daysUntilDeadline > 30) score += 5;
    }

    return Math.min(100, score);
  }

  private async dispatchToEnrichisseur(
    leadId: string,
    source: string,
    preScore: number,
  ): Promise<void> {
    const priority = preScore >= 60 ? 1 : preScore >= 40 ? 5 : 10;

    await this.enrichisseurQueue.add(
      'enrich-lead',
      {
        leadId,
        source,
        preScore,
        highPriority: preScore >= 60,
        dispatchedAt: new Date().toISOString(),
      },
      {
        priority,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.debug({
      msg: 'Dispatched to enrichisseur',
      leadId,
      preScore,
      priority,
    });
  }
}
