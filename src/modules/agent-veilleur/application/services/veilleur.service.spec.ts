import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { VeilleurService } from './veilleur.service';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { IMarketDataAdapter, MarketOpportunity } from '@common/ports/i-market-data.adapter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

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
  let mockQueue: { add: jest.Mock };
  let mockEventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    repository = new MockRawLeadRepository();

    mockMarketDataAdapter = {
      fetchRecentOpportunities: jest.fn().mockResolvedValue([makeOpportunity()]),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeilleurService,
        { provide: IRawLeadRepository, useValue: repository },
        { provide: IMarketDataAdapter, useValue: mockMarketDataAdapter },
        { provide: getQueueToken(QUEUE_NAMES.ENRICHISSEUR_PIPELINE), useValue: mockQueue },
        { provide: EventEmitter2, useValue: mockEventEmitter },
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

    it('skips duplicate opportunities already in repository', async () => {
      // First call — creates the lead
      await service.detectLeads(baseDto);

      // Second call with same URL — should skip (duplicate)
      const secondBatch = await service.detectLeads(baseDto);
      expect(secondBatch).toHaveLength(0);
    });

    it('dispatches lead to enrichisseur queue', async () => {
      await service.detectLeads(baseDto);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'enrich-lead',
        expect.objectContaining({
          source: 'boamp',
        }),
        expect.objectContaining({
          attempts: 3,
        }),
      );
    });

    it('uses priority 1 for high preScore (>=60)', async () => {
      // relevanceScore=100 → preScore signal = 35, freshness = 10 → at least 45 base
      // with estimatedValue >= 100000 → +15 = 60+
      mockMarketDataAdapter.fetchRecentOpportunities.mockResolvedValueOnce([
        makeOpportunity({ relevanceScore: 100, estimatedValue: 150000 }),
      ]);

      await service.detectLeads(baseDto);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'enrich-lead',
        expect.anything(),
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('uses priority 10 for low preScore (<40)', async () => {
      // relevanceScore=0, no value, published 10+ days ago → very low score
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      mockMarketDataAdapter.fetchRecentOpportunities.mockResolvedValueOnce([
        makeOpportunity({ relevanceScore: 0, estimatedValue: undefined, publishedAt: oldDate }),
      ]);

      await service.detectLeads(baseDto);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'enrich-lead',
        expect.anything(),
        expect.objectContaining({ priority: 10 }),
      );
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
      expect(mockQueue.add).not.toHaveBeenCalled();
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
