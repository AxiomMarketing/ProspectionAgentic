import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { NetrowsAdapter } from '../../infrastructure/adapters/linkedin/netrows.adapter';
import { SignalsApiAdapter } from '../../infrastructure/adapters/linkedin/signals-api.adapter';
import { RssFundingAdapter } from '../../infrastructure/adapters/linkedin/rss-funding.adapter';
import { LinkedInSignal } from '../../infrastructure/adapters/linkedin/linkedin-signal.interface';

interface GroupedCompany {
  companyName: string;
  companyLinkedinUrl?: string;
  signals: LinkedInSignal[];
  totalScore: number;
}

@Injectable()
export class LinkedInScanService {
  private readonly logger = new Logger(LinkedInScanService.name);

  constructor(
    private readonly netrowsAdapter: NetrowsAdapter,
    private readonly signalsApiAdapter: SignalsApiAdapter,
    private readonly rssFundingAdapter: RssFundingAdapter,
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
    @InjectQueue(QUEUE_NAMES.ENRICHISSEUR_PIPELINE) private readonly enrichisseurQueue: Queue,
  ) {}

  async scanLinkedIn(data: { since: string }): Promise<void> {
    const since = new Date(data.since);
    this.logger.log({ msg: 'Starting LinkedIn scan', since: since.toISOString() });

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'linkedin_scan_started',
      payload: { since: since.toISOString() },
    });

    // 1. Run all adapters in parallel (fault-tolerant)
    const [netrowsJobResult, netrowsHeadcountResult, signalsApiResult, rssResult] =
      await Promise.allSettled([
        this.netrowsAdapter.getJobChanges(since),
        this.netrowsAdapter.getHeadcountChanges([]),
        this.signalsApiAdapter.getHiringSignals([
          'digital',
          'numérique',
          'marketing',
          'site web',
          'application',
          'e-commerce',
        ]),
        this.rssFundingAdapter.getFundingEvents(),
      ]);

    // 2. Merge all signals
    const allSignals: LinkedInSignal[] = [];
    for (const result of [netrowsJobResult, netrowsHeadcountResult, signalsApiResult, rssResult]) {
      if (result.status === 'fulfilled') {
        allSignals.push(...result.value);
      } else {
        this.logger.warn({ msg: 'Adapter failed', reason: result.reason });
      }
    }

    this.logger.log({ msg: 'Signals collected', total: allSignals.length });

    // 3. Group by company (dedup)
    const grouped = this.groupByCompany(allSignals);

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'linkedin_signals_grouped',
      payload: { totalSignals: allSignals.length, uniqueCompanies: grouped.size },
    });

    if (grouped.size === 0) {
      this.logger.log({ msg: 'No LinkedIn signals found' });
      return;
    }

    // 4. Create RawLeads (source='linkedin') with signals in rawData
    const companies = Array.from(grouped.values());
    const savedLeads = await this.saveRawLeads(companies);

    await this.agentEventLogger.log({
      agentName: 'veilleur',
      eventType: 'linkedin_leads_saved',
      payload: { count: savedLeads.length },
    });

    // 5. Dispatch to enrichisseur-pipeline
    if (savedLeads.length > 0) {
      await this.enrichisseurQueue.addBulk(
        savedLeads.map(({ leadId, totalScore }) => {
          const priority = totalScore >= 60 ? 1 : totalScore >= 40 ? 5 : 10;
          return {
            name: 'enrich-lead' as const,
            data: {
              leadId,
              source: 'linkedin',
              preScore: totalScore,
              highPriority: totalScore >= 60,
              dispatchedAt: new Date().toISOString(),
            },
            opts: {
              priority,
              attempts: 3,
              backoff: { type: 'exponential' as const, delay: 5000 },
            },
          };
        }),
      );

      await this.agentEventLogger.log({
        agentName: 'veilleur',
        eventType: 'linkedin_leads_dispatched',
        payload: { count: savedLeads.length, queue: 'enrichisseur' },
      });
    }

    this.logger.log({
      msg: 'LinkedIn scan complete',
      totalSignals: allSignals.length,
      uniqueCompanies: grouped.size,
      leadsCreated: savedLeads.length,
    });
  }

  private groupByCompany(signals: LinkedInSignal[]): Map<string, GroupedCompany> {
    const map = new Map<string, GroupedCompany>();

    for (const signal of signals) {
      const key = signal.companyName.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        existing.signals.push(signal);
        existing.totalScore = Math.min(100, existing.totalScore + signal.score);
        if (!existing.companyLinkedinUrl && signal.companyLinkedinUrl) {
          existing.companyLinkedinUrl = signal.companyLinkedinUrl;
        }
      } else {
        map.set(key, {
          companyName: signal.companyName,
          companyLinkedinUrl: signal.companyLinkedinUrl,
          signals: [signal],
          totalScore: signal.score,
        });
      }
    }

    return map;
  }

  private async saveRawLeads(
    companies: GroupedCompany[],
  ): Promise<{ leadId: string; totalScore: number }[]> {
    const results: { leadId: string; totalScore: number }[] = [];

    for (const company of companies) {
      const sourceId = `linkedin:${company.companyName.toLowerCase().replace(/\s+/g, '-')}`;

      // Check for existing lead (dedup)
      const existing = await this.prisma.rawLead.findFirst({
        where: { sourceId, source: 'linkedin' },
      });
      if (existing) continue;

      const lead = await this.prisma.rawLead.create({
        data: {
          id: crypto.randomUUID(),
          source: 'linkedin',
          sourceId,
          sourceUrl: company.companyLinkedinUrl,
          rawData: {
            companyName: company.companyName,
            companyLinkedinUrl: company.companyLinkedinUrl,
            signals: company.signals.map((s) => ({
              type: s.type,
              detail: s.detail,
              score: s.score,
              personName: s.personName,
              personRole: s.personRole,
              detectedAt: s.detectedAt.toISOString(),
            })),
            totalScore: company.totalScore,
            scannedAt: new Date().toISOString(),
          },
          processed: false,
        },
      });

      results.push({ leadId: lead.id, totalScore: company.totalScore });
    }

    return results;
  }
}
