import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import {
  JobBoardScannerAdapter,
  JobPosting,
  DetectedSignal,
} from '../../infrastructure/adapters/jobboard-scanner.adapter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';

interface ScanJobBoardsData {
  keywords: string[];
  location?: string;
}

interface CompanySignalSummary {
  companyName: string;
  postings: JobPosting[];
  signals: DetectedSignal[];
  totalScore: number;
  primaryUrl: string;
}

@Injectable()
export class JobBoardScanService {
  private readonly logger = new Logger(JobBoardScanService.name);

  constructor(
    private readonly jobBoardScanner: JobBoardScannerAdapter,
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly rawLeadRepository: IRawLeadRepository,
    @InjectQueue(QUEUE_NAMES.ENRICHISSEUR_PIPELINE) private readonly enrichisseurQueue: Queue,
  ) {}

  async scanJobBoards(data: ScanJobBoardsData): Promise<RawLead[]> {
    this.logger.log({ msg: 'Starting job board scan', keywords: data.keywords });

    await this.agentEventLogger.log({
      agentName: 'veilleur-jobboard',
      eventType: 'scan_started',
      payload: { keywords: data.keywords, location: data.location },
    });

    // 1. Fetch all job postings
    const postings = await this.jobBoardScanner.searchJobs(data.keywords, data.location);

    await this.agentEventLogger.log({
      agentName: 'veilleur-jobboard',
      eventType: 'postings_fetched',
      payload: { count: postings.length },
    });

    if (postings.length === 0) {
      this.logger.log({ msg: 'No job postings found', keywords: data.keywords });
      return [];
    }

    // 2. Detect signals and group by company
    const signals = this.jobBoardScanner.detectSignals(postings);
    const companySummaries = this.buildCompanySummaries(postings, signals);

    // 3. Filter to companies that have at least one signal
    const companiesWithSignals = companySummaries.filter((s) => s.signals.length > 0);

    if (companiesWithSignals.length === 0) {
      this.logger.log({ msg: 'No signals detected in job postings' });
      return [];
    }

    // 4. Deduplicate against existing RawLeads
    const sourceUrls = companiesWithSignals.map((s) => s.primaryUrl);
    const existingLeads = await this.rawLeadRepository.findBySourceUrls(sourceUrls);
    const existingUrls = new Set(existingLeads.map((l) => l.sourceUrl));

    const newCompanies = companiesWithSignals.filter((s) => !existingUrls.has(s.primaryUrl));

    if (newCompanies.length === 0) {
      this.logger.log({ msg: 'All job board signals already processed (duplicates)' });
      return [];
    }

    // 5. Create RawLeads in a transaction
    const savedRecords = await this.prisma.$transaction(
      newCompanies.map(({ companyName, postings: companyPostings, signals: companySignals, primaryUrl }) => {
        const lead = RawLead.create({
          source: 'job_board',
          sourceId: primaryUrl,
          sourceUrl: primaryUrl,
          rawData: {
            companyName,
            postings: companyPostings,
            signals: companySignals,
            detectedSignals: companySignals.map((s) => s.signalType),
          },
        });

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
      agentName: 'veilleur-jobboard',
      eventType: 'leads_saved',
      payload: { count: newLeads.length },
    });

    // 6. Dispatch to enrichisseur with pre-score based on signal strength
    await this.enrichisseurQueue.addBulk(
      newLeads.map((lead, i) => {
        const company = newCompanies[i];
        const preScore = Math.min(100, company.totalScore);
        const priority = preScore >= 60 ? 1 : preScore >= 40 ? 5 : 10;

        return {
          name: 'enrich-lead' as const,
          data: {
            leadId: lead.id,
            source: 'job_board',
            preScore,
            highPriority: preScore >= 60,
            companyName: company.companyName,
            signals: company.signals.map((s) => s.signalType),
            dispatchedAt: new Date().toISOString(),
          },
          opts: { priority, attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } },
        };
      }),
    );

    await this.agentEventLogger.log({
      agentName: 'veilleur-jobboard',
      eventType: 'leads_dispatched',
      payload: { count: newLeads.length, queue: 'enrichisseur' },
    });

    this.logger.log({
      msg: 'Job board scan complete',
      totalPostings: postings.length,
      companiesWithSignals: companiesWithSignals.length,
      newLeads: newLeads.length,
      duplicatesSkipped: companiesWithSignals.length - newLeads.length,
    });

    return newLeads;
  }

  private buildCompanySummaries(
    postings: JobPosting[],
    signals: DetectedSignal[],
  ): CompanySignalSummary[] {
    const byCompany = new Map<string, JobPosting[]>();

    for (const posting of postings) {
      const key = posting.companyName.toLowerCase().trim();
      const existing = byCompany.get(key);
      if (existing) {
        existing.push(posting);
      } else {
        byCompany.set(key, [posting]);
      }
    }

    const signalsByCompany = new Map<string, DetectedSignal[]>();
    for (const signal of signals) {
      const key = signal.companyName.toLowerCase().trim();
      const existing = signalsByCompany.get(key);
      if (existing) {
        existing.push(signal);
      } else {
        signalsByCompany.set(key, [signal]);
      }
    }

    const summaries: CompanySignalSummary[] = [];

    for (const [key, companyPostings] of byCompany.entries()) {
      const companySignals = signalsByCompany.get(key) ?? [];
      const totalScore = companySignals.reduce((sum, s) => sum + s.score, 0);
      const bestPosting = companyPostings.find((p) => p.url) ?? companyPostings[0];

      summaries.push({
        companyName: companyPostings[0].companyName,
        postings: companyPostings,
        signals: companySignals,
        totalScore,
        primaryUrl: bestPosting?.url ?? `job_board://${key}`,
      });
    }

    return summaries;
  }
}
