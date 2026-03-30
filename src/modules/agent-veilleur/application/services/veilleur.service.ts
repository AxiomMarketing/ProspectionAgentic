import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { IMarketDataAdapter, MarketOpportunity } from '@common/ports/i-market-data.adapter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { DetectLeadDto } from '../dtos/detect-lead.dto';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { WebScanService } from './web-scan.service';
import { JobBoardScanService } from './jobboard-scan.service';
import { LinkedInScanService } from './linkedin-scan.service';

@Injectable()
export class VeilleurService {
  private readonly logger = new Logger(VeilleurService.name);

  constructor(
    private readonly rawLeadRepository: IRawLeadRepository,
    private readonly marketDataAdapter: IMarketDataAdapter,
    @InjectQueue(QUEUE_NAMES.ENRICHISSEUR_PIPELINE) private readonly enrichisseurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.APPELS_OFFRES_PIPELINE) private readonly appelsOffresQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly webScanService: WebScanService,
    private readonly jobBoardScanService: JobBoardScanService,
    private readonly linkedInScanService: LinkedInScanService,
  ) {}

  async detectLeads(dto: DetectLeadDto): Promise<RawLead[]> {
    this.logger.log({ msg: 'Starting lead detection', source: dto.source, keywords: dto.keywords });

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'scan_started',
      payload: { source: dto.source, keywords: dto.keywords },
    });

    // 1. Fetch opportunities from market data source
    const opportunities = await this.marketDataAdapter.fetchRecentOpportunities({
      source: dto.source,
      since: new Date(Date.now() - dto.sinceDays * 24 * 60 * 60 * 1000),
      keywords: dto.keywords,
      maxResults: dto.maxResults,
    });

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'opportunities_fetched',
      payload: { count: opportunities.length, source: dto.source },
    });

    // 2. Filter by minimum relevance score
    const filtered = opportunities.filter((o) => o.relevanceScore >= dto.minRelevanceScore);

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'opportunities_filtered',
      payload: { total: opportunities.length, filtered: filtered.length, duplicatesSkipped: 0 },
    });

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

    // 4. Build domain objects for new leads in memory
    const leadsToCreate: { lead: RawLead; preScore: number; opp: (typeof filtered)[number] }[] = [];
    for (const opp of filtered) {
      if (existingUrls.has(opp.url)) continue;
      const lead = RawLead.create({
        source: dto.source,
        sourceId: opp.url,
        sourceUrl: opp.url,
        rawData: opp.raw,
      });
      leadsToCreate.push({ lead, preScore: this.calculatePreScore(opp), opp });
    }

    if (leadsToCreate.length === 0) {
      this.logger.log({
        msg: 'Lead detection complete',
        totalOpportunities: opportunities.length,
        filtered: filtered.length,
        duplicatesSkipped: filtered.length,
        newLeads: 0,
      });
      return [];
    }

    // 5. Save all leads in one transaction
    const savedRecords = await this.prisma.$transaction(
      leadsToCreate.map(({ lead }) => {
        const plain = lead.toPlainObject();
        return this.prisma.rawLead.create({
          data: {
            id: plain.id,
            source: plain.source,
            sourceId: plain.sourceId,
            sourceUrl: plain.sourceUrl,
            rawData: plain.rawData as import('@prisma/client').Prisma.InputJsonValue,
            processed: plain.processed,
          },
        });
      }),
    );

    const newLeads = savedRecords.map((r) =>
      RawLead.reconstitute({
        id: r.id,
        source: r.source,
        sourceId: r.sourceId,
        sourceUrl: r.sourceUrl ?? undefined,
        rawData: r.rawData as Record<string, unknown>,
        processed: r.processed,
        processedAt: r.processedAt ?? undefined,
        prospectId: r.prospectId ?? undefined,
        createdAt: r.createdAt,
      }),
    );

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'leads_saved',
      payload: { count: newLeads.length },
    });

    // 6. Route based on source: BOAMP → public_tenders, others → enrichisseur
    if (dto.source === 'boamp') {
      await this.dispatchToTenderPipeline(newLeads, leadsToCreate);
    } else {
      await this.dispatchToEnrichisseurPipeline(newLeads, leadsToCreate, dto.source);
    }

    // 7. Emit domain events
    for (let i = 0; i < newLeads.length; i++) {
      const lead = newLeads[i];
      const { preScore, opp } = leadsToCreate[i];
      this.eventEmitter.emit('lead.detected', {
        leadId: lead.id,
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

    // Log agent event for dashboard visibility
    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'leads_detected',
      payload: {
        source: dto.source,
        totalOpportunities: opportunities.length,
        newLeads: newLeads.length,
      },
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
    const [total, processed, bySourceRaw] = await Promise.all([
      this.prisma.rawLead.count(),
      this.prisma.rawLead.count({ where: { processed: true } }),
      this.prisma.rawLead.groupBy({ by: ['source'], _count: { _all: true } }),
    ]);

    const bySource = Object.fromEntries(bySourceRaw.map((r) => [r.source, r._count._all]));

    return {
      total,
      processed,
      pending: total - processed,
      bySource,
    };
  }

  async scanWebsites(data: Record<string, unknown>): Promise<void> {
    this.logger.log({ msg: 'Starting web audit scan', data });
    await this.webScanService.scanBatch({
      batchSize: (data.batchSize as number) ?? 500,
      minScore: (data.minScore as number) ?? 30,
    });
  }

  async scanJobBoards(data: Record<string, unknown>): Promise<void> {
    this.logger.log({ msg: 'Starting job board scan', data });
    await this.jobBoardScanService.scanJobBoards({
      keywords: (data.keywords as string[]) ?? ['développeur web', 'développeur react', 'chef de projet digital'],
    });
  }

  async scanLinkedIn(data: Record<string, unknown>): Promise<void> {
    this.logger.log({ msg: 'Starting LinkedIn scan', data });
    await this.linkedInScanService.scanLinkedIn({
      since: (data.since as string) ?? new Date(Date.now() - 6 * 3600_000).toISOString(),
    });
  }

  private async dispatchToTenderPipeline(
    newLeads: RawLead[],
    leadsToCreate: { lead: RawLead; preScore: number; opp: MarketOpportunity }[],
  ): Promise<void> {
    // Create PublicTender records instead of going through enrichisseur
    const tenders = await this.prisma.$transaction(
      leadsToCreate.map(({ opp, preScore }) =>
        this.prisma.publicTender.create({
          data: {
            source: 'boamp',
            sourceId: opp.url,
            sourceUrl: opp.url,
            title: opp.title || 'Sans titre',
            description: opp.description,
            buyerName: opp.companyName,
            publicationDate: opp.publishedAt,
            deadlineDate: opp.deadline,
            estimatedAmount: opp.estimatedValue,
            cpvCodes: opp.cpvCodes ?? [],
            dceFitScore: preScore,
          },
        }),
      ),
    );

    // Dispatch to appels-offres-pipeline (Agent 9)
    await this.appelsOffresQueue.addBulk(
      tenders.map((tender) => ({
        name: 'analyze-tender' as const,
        data: {
          tenderId: tender.id,
          source: 'boamp',
          dceFitScore: tender.dceFitScore,
          dispatchedAt: new Date().toISOString(),
        },
        opts: { attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } },
      })),
    );

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'tenders_dispatched',
      payload: { count: tenders.length, queue: 'appels-offres' },
    });

    this.logger.log({ msg: 'BOAMP tenders dispatched to appels-offres-pipeline', count: tenders.length });
  }

  private async dispatchToEnrichisseurPipeline(
    newLeads: RawLead[],
    leadsToCreate: { lead: RawLead; preScore: number; opp: MarketOpportunity }[],
    source: string,
  ): Promise<void> {
    await this.enrichisseurQueue.addBulk(
      newLeads.map((lead, i) => {
        const preScore = leadsToCreate[i].preScore;
        const priority = preScore >= 60 ? 1 : preScore >= 40 ? 5 : 10;
        return {
          name: 'enrich-lead' as const,
          data: {
            leadId: lead.id,
            source,
            preScore,
            highPriority: preScore >= 60,
            dispatchedAt: new Date().toISOString(),
          },
          opts: { priority, attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } },
        };
      }),
    );

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'leads_dispatched',
      payload: { count: newLeads.length, queue: 'enrichisseur' },
    });
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

}

