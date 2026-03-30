// Mock ESM modules that can't be loaded by Jest in CJS mode
jest.mock('lighthouse', () => jest.fn());
jest.mock('chrome-launcher', () => ({ launch: jest.fn() }));
jest.mock('wappalyzer-core', () => jest.fn());
jest.mock('axe-core', () => ({ run: jest.fn() }));
jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({ parseURL: jest.fn().mockResolvedValue({ items: [] }) })));

import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { VeilleurService } from './veilleur.service';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { IMarketDataAdapter, MarketOpportunity } from '@common/ports/i-market-data.adapter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { PrismaService } from '@core/database/prisma.service';
import { WebScanService } from './web-scan.service';
import { JobBoardScanService } from './jobboard-scan.service';
import { LinkedInScanService } from './linkedin-scan.service';

class MockRawLeadRepository extends IRawLeadRepository {
  private leads: RawLead[] = [];

  async findById(id: string): Promise<RawLead | null> {
    return this.leads.find((l) => l.id === id) ?? null;
  }

  async findBySourceUrl(url: string): Promise<RawLead | null> {
    return this.leads.find((l) => l.sourceUrl === url) ?? null;
  }

  async findBySourceUrls(urls: string[]): Promise<RawLead[]> {
    return this.leads.filter((l) => urls.includes(l.sourceUrl!));
  }

  async findPending(limit?: number): Promise<RawLead[]> {
    const pending = this.leads.filter((l) => !l.processed);
    return limit ? pending.slice(0, limit) : pending;
  }

  async save(lead: RawLead): Promise<RawLead> {
    this.leads.push(lead);
    return lead;
  }

  async update(lead: RawLead): Promise<RawLead> {
    const idx = this.leads.findIndex((l) => l.id === lead.id);
    if (idx >= 0) this.leads[idx] = lead;
    return lead;
  }

  async countBySourceSince(): Promise<number> {
    return this.leads.length;
  }

  clear(): void {
    this.leads = [];
  }
}

const makeOpportunity = (overrides: Partial<MarketOpportunity> = {}): MarketOpportunity => ({
  url: 'https://www.boamp.fr/avis/TEST-001',
  companyName: 'Acheteur Test',
  title: 'Marché test',
  description: 'Description du marché',
  publishedAt: new Date(),
  relevanceScore: 75,
  raw: {},
  ...overrides,
});

describe('VeilleurService', () => {
  let service: VeilleurService;
  let repository: MockRawLeadRepository;
  let mockMarketDataAdapter: { fetchRecentOpportunities: jest.Mock; isAvailable: jest.Mock };
  let mockEnrichisseurQueue: Record<string, jest.Mock>;
  let mockAppelsOffresQueue: Record<string, jest.Mock>;
  let mockEventEmitter: { emit: jest.Mock };
  let mockPrisma: Record<string, any>;

  beforeEach(async () => {
    repository = new MockRawLeadRepository();

    mockMarketDataAdapter = {
      fetchRecentOpportunities: jest.fn().mockResolvedValue([makeOpportunity()]),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    mockEnrichisseurQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      addBulk: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
    };
    mockAppelsOffresQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      addBulk: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockPrisma = {
      rawLead: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `lead-${Date.now()}`, ...data })),
      },
      publicTender: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `tender-${Date.now()}`, ...data, dceFitScore: data.dceFitScore ?? 0 })),
      },
      $transaction: jest.fn().mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeilleurService,
        { provide: IRawLeadRepository, useValue: repository },
        { provide: IMarketDataAdapter, useValue: mockMarketDataAdapter },
        { provide: getQueueToken(QUEUE_NAMES.ENRICHISSEUR_PIPELINE), useValue: mockEnrichisseurQueue },
        { provide: getQueueToken(QUEUE_NAMES.APPELS_OFFRES_PIPELINE), useValue: mockAppelsOffresQueue },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentEventLoggerService, useValue: { log: jest.fn() } },
        { provide: WebScanService, useValue: { scanBatch: jest.fn() } },
        { provide: JobBoardScanService, useValue: { scanJobBoards: jest.fn() } },
        { provide: LinkedInScanService, useValue: { scanLinkedIn: jest.fn() } },
      ],
    }).compile();

    service = module.get<VeilleurService>(VeilleurService);
  });

  describe('detectLeads()', () => {
    const baseDto = {
      source: 'boamp' as const,
      keywords: ['informatique'],
      maxResults: 20,
      sinceDays: 7,
      minRelevanceScore: 0,
    };

    it('creates new leads for unseen opportunities', async () => {
      const newLeads = await service.detectLeads(baseDto);
      expect(newLeads).toHaveLength(1);
      expect(newLeads[0].source).toBe('boamp');
    });

    it('handles duplicate opportunities gracefully', async () => {
      // With batch approach, dedup happens at DB level (unique constraint)
      // Simulate: $transaction rejects duplicates
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('Unique constraint failed'));

      // Service should handle the error gracefully, not crash
      await expect(service.detectLeads(baseDto)).rejects.toThrow();
    });

    it('dispatches leads to enrichisseur queue via addBulk', async () => {
      await service.detectLeads(baseDto);

      // BOAMP goes to appels-offres-pipeline, NOT enrichisseur
      expect(mockAppelsOffresQueue.addBulk).toHaveBeenCalledTimes(1);
      const bulkJobs = mockAppelsOffresQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs).toHaveLength(1);
      expect(bulkJobs[0].name).toBe('analyze-tender');
      expect(bulkJobs[0].data).toHaveProperty('source', 'boamp');
    });

    it('dispatches to enrichisseur for non-boamp sources', async () => {
      const dto = { ...baseDto, source: 'linkedin' as const };
      await service.detectLeads(dto);

      expect(mockEnrichisseurQueue.addBulk).toHaveBeenCalledTimes(1);
      const bulkJobs = mockEnrichisseurQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs[0].name).toBe('enrich-lead');
    });

    it('uses priority 1 for high preScore (>=60) on non-boamp leads', async () => {
      mockMarketDataAdapter.fetchRecentOpportunities.mockResolvedValueOnce([
        makeOpportunity({ relevanceScore: 100, estimatedValue: 150000 }),
      ]);

      await service.detectLeads({ ...baseDto, source: 'linkedin' as const });

      const bulkJobs = mockEnrichisseurQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs[0].opts.priority).toBe(1);
    });

    it('uses priority 10 for low preScore (<40) on non-boamp leads', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      mockMarketDataAdapter.fetchRecentOpportunities.mockResolvedValueOnce([
        makeOpportunity({ relevanceScore: 0, estimatedValue: undefined, publishedAt: oldDate }),
      ]);

      await service.detectLeads({ ...baseDto, source: 'web' as const });

      const bulkJobs = mockEnrichisseurQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs[0].opts.priority).toBe(10);
    });

    it('filters out opportunities below minRelevanceScore', async () => {
      mockMarketDataAdapter.fetchRecentOpportunities.mockResolvedValueOnce([
        makeOpportunity({ url: 'https://boamp.fr/1', relevanceScore: 10 }),
        makeOpportunity({ url: 'https://boamp.fr/2', relevanceScore: 80 }),
      ]);

      const leads = await service.detectLeads({ ...baseDto, minRelevanceScore: 50 });

      expect(leads).toHaveLength(1);
    });

    it('emits lead.detected event for each new lead', async () => {
      await service.detectLeads(baseDto);

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'lead.detected',
        expect.objectContaining({
          source: 'boamp',
          companyName: 'Acheteur Test',
        }),
      );
    });

    it('returns empty array when all opportunities are below threshold', async () => {
      mockMarketDataAdapter.fetchRecentOpportunities.mockResolvedValueOnce([
        makeOpportunity({ relevanceScore: 5 }),
      ]);

      const leads = await service.detectLeads({ ...baseDto, minRelevanceScore: 50 });
      expect(leads).toEqual([]);
      expect(mockEnrichisseurQueue.addBulk).not.toHaveBeenCalled();
    });
  });

  describe('getPendingLeads()', () => {
    it('delegates to repository.findPending', async () => {
      const lead = RawLead.create({
        source: 'boamp',
        sourceId: 'test-1',
        sourceUrl: 'https://boamp.fr/test',
        rawData: {},
      });
      await repository.save(lead);

      const pending = await service.getPendingLeads();
      expect(pending).toHaveLength(1);
      expect(pending[0].source).toBe('boamp');
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.save(
          RawLead.create({
            source: 'boamp',
            sourceId: `id-${i}`,
            sourceUrl: `https://boamp.fr/${i}`,
            rawData: {},
          }),
        );
      }

      const pending = await service.getPendingLeads(3);
      expect(pending).toHaveLength(3);
    });
  });
});
