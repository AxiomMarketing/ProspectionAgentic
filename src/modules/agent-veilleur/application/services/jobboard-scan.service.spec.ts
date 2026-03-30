import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { JobBoardScanService } from './jobboard-scan.service';
import { JobBoardScannerAdapter, JobPosting } from '../../infrastructure/adapters/jobboard-scanner.adapter';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const makePosting = (overrides: Partial<JobPosting> = {}): JobPosting => ({
  companyName: 'Acme Corp',
  jobTitle: 'Développeur React',
  platform: 'linkedin',
  url: 'https://linkedin.com/jobs/1',
  location: 'Paris',
  publishedAt: new Date(),
  rawData: {},
  ...overrides,
});

class MockRawLeadRepository extends IRawLeadRepository {
  private leads: RawLead[] = [];

  async findById(id: string): Promise<RawLead | null> {
    return this.leads.find((l) => l.id === id) ?? null;
  }

  async findBySourceUrl(url: string): Promise<RawLead | null> {
    return this.leads.find((l) => l.sourceUrl === url) ?? null;
  }

  async findBySourceUrls(urls: string[]): Promise<RawLead[]> {
    return this.leads.filter((l) => l.sourceUrl && urls.includes(l.sourceUrl));
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

  seed(lead: RawLead): void {
    this.leads.push(lead);
  }

  clear(): void {
    this.leads = [];
  }
}

describe('JobBoardScanService', () => {
  let service: JobBoardScanService;
  let repository: MockRawLeadRepository;
  let mockScanner: jest.Mocked<Pick<JobBoardScannerAdapter, 'searchJobs' | 'detectSignals'>>;
  let mockQueue: { addBulk: jest.Mock };
  let mockPrisma: Record<string, unknown>;

  beforeEach(async () => {
    repository = new MockRawLeadRepository();

    mockScanner = {
      searchJobs: jest.fn().mockResolvedValue([]),
      detectSignals: jest.fn().mockReturnValue([]),
    };

    mockQueue = {
      addBulk: jest.fn().mockResolvedValue([]),
    };

    mockPrisma = {
      rawLead: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: data['id'] ?? `lead-${Date.now()}`,
            source: data['source'],
            sourceId: data['sourceId'],
            sourceUrl: data['sourceUrl'],
            rawData: data['rawData'],
            processed: false,
            processedAt: null,
            prospectId: null,
            createdAt: new Date(),
          }),
        ),
      },
      $transaction: jest.fn().mockImplementation((promises: Promise<unknown>[]) =>
        Promise.all(promises),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobBoardScanService,
        { provide: JobBoardScannerAdapter, useValue: mockScanner },
        { provide: IRawLeadRepository, useValue: repository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentEventLoggerService, useValue: { log: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.ENRICHISSEUR_PIPELINE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<JobBoardScanService>(JobBoardScanService);
  });

  describe('scanJobBoards()', () => {
    it('returns empty array when no postings found', async () => {
      mockScanner.searchJobs.mockResolvedValueOnce([]);

      const result = await service.scanJobBoards({ keywords: ['react'] });

      expect(result).toEqual([]);
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });

    it('returns empty array when postings have no signals', async () => {
      mockScanner.searchJobs.mockResolvedValueOnce([makePosting()]);
      mockScanner.detectSignals.mockReturnValueOnce([]);

      const result = await service.scanJobBoards({ keywords: ['react'] });

      expect(result).toEqual([]);
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });

    it('creates leads and dispatches to enrichisseur when signals detected', async () => {
      const posting = makePosting({ jobTitle: 'Développeur React' });
      mockScanner.searchJobs.mockResolvedValueOnce([posting]);
      mockScanner.detectSignals.mockReturnValueOnce([
        {
          companyName: 'Acme Corp',
          signalType: 'budget_tech_disponible',
          score: 20,
          reason: 'React keyword',
          postings: [posting],
        },
      ]);

      const result = await service.scanJobBoards({ keywords: ['react'] });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('job_board');
      expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
    });

    it('dispatches with correct preScore based on signal strength', async () => {
      const posting = makePosting();
      mockScanner.searchJobs.mockResolvedValueOnce([posting]);
      mockScanner.detectSignals.mockReturnValueOnce([
        {
          companyName: 'Acme Corp',
          signalType: 'besoin_externalisable',
          score: 28,
          reason: 'refonte keyword',
          postings: [posting],
        },
        {
          companyName: 'Acme Corp',
          signalType: 'budget_tech_disponible',
          score: 20,
          reason: 'React keyword',
          postings: [posting],
        },
      ]);

      await service.scanJobBoards({ keywords: ['react', 'refonte'] });

      const bulkJobs = mockQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs[0].data.preScore).toBe(48);
      expect(bulkJobs[0].opts.priority).toBe(5);
    });

    it('caps preScore at 100', async () => {
      const posting = makePosting();
      mockScanner.searchJobs.mockResolvedValueOnce([posting]);
      mockScanner.detectSignals.mockReturnValueOnce([
        { companyName: 'Acme Corp', signalType: 'signal1', score: 50, reason: '', postings: [posting] },
        { companyName: 'Acme Corp', signalType: 'signal2', score: 50, reason: '', postings: [posting] },
        { companyName: 'Acme Corp', signalType: 'signal3', score: 50, reason: '', postings: [posting] },
      ]);

      await service.scanJobBoards({ keywords: ['test'] });

      const bulkJobs = mockQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs[0].data.preScore).toBe(100);
    });
  });

  describe('deduplication', () => {
    it('skips companies already in database', async () => {
      const posting = makePosting({ url: 'https://linkedin.com/jobs/existing' });
      mockScanner.searchJobs.mockResolvedValueOnce([posting]);
      mockScanner.detectSignals.mockReturnValueOnce([
        {
          companyName: 'Acme Corp',
          signalType: 'budget_tech_disponible',
          score: 20,
          reason: 'React',
          postings: [posting],
        },
      ]);

      const existingLead = RawLead.create({
        source: 'job_board',
        sourceId: 'https://linkedin.com/jobs/existing',
        sourceUrl: 'https://linkedin.com/jobs/existing',
        rawData: {},
      });
      repository.seed(existingLead);

      const result = await service.scanJobBoards({ keywords: ['react'] });

      expect(result).toEqual([]);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });

    it('processes only new companies when some are duplicates', async () => {
      const existingPosting = makePosting({
        companyName: 'Existing Corp',
        url: 'https://linkedin.com/jobs/existing',
      });
      const newPosting = makePosting({
        companyName: 'New Corp',
        url: 'https://linkedin.com/jobs/new',
      });

      mockScanner.searchJobs.mockResolvedValueOnce([existingPosting, newPosting]);
      mockScanner.detectSignals.mockReturnValueOnce([
        {
          companyName: 'Existing Corp',
          signalType: 'budget_tech_disponible',
          score: 20,
          reason: 'React',
          postings: [existingPosting],
        },
        {
          companyName: 'New Corp',
          signalType: 'budget_tech_disponible',
          score: 20,
          reason: 'React',
          postings: [newPosting],
        },
      ]);

      const existingLead = RawLead.create({
        source: 'job_board',
        sourceId: 'https://linkedin.com/jobs/existing',
        sourceUrl: 'https://linkedin.com/jobs/existing',
        rawData: {},
      });
      repository.seed(existingLead);

      const result = await service.scanJobBoards({ keywords: ['react'] });

      expect(result).toHaveLength(1);
      const bulkJobs = mockQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs[0].data.companyName).toBe('New Corp');
    });
  });

  describe('signal detection (via adapter)', () => {
    it('detects budget_tech_disponible for React jobs', () => {
      const adapter = new JobBoardScannerAdapter({
        get: (key: string) => {
          if (key === 'HASDATA_BASE_URL') return 'https://api.hasdata.com';
          return undefined;
        },
      } as never);

      const postings: JobPosting[] = [
        makePosting({ jobTitle: 'Développeur React Senior', companyName: 'TechCorp' }),
      ];

      const signals = adapter.detectSignals(postings);

      expect(signals).toHaveLength(1);
      expect(signals[0].signalType).toBe('budget_tech_disponible');
      expect(signals[0].score).toBe(20);
    });

    it('detects besoin_externalisable for refonte keywords', () => {
      const adapter = new JobBoardScannerAdapter({
        get: (key: string) => {
          if (key === 'HASDATA_BASE_URL') return 'https://api.hasdata.com';
          return undefined;
        },
      } as never);

      const postings: JobPosting[] = [
        makePosting({
          jobTitle: 'Chef de projet refonte site web',
          companyName: 'RefonteCorp',
        }),
      ];

      const signals = adapter.detectSignals(postings);
      const signalTypes = signals.map((s) => s.signalType);

      expect(signalTypes).toContain('besoin_externalisable');
    });

    it('detects multi_offres when 3+ postings from same company', () => {
      const adapter = new JobBoardScannerAdapter({
        get: (key: string) => {
          if (key === 'HASDATA_BASE_URL') return 'https://api.hasdata.com';
          return undefined;
        },
      } as never);

      const postings: JobPosting[] = [
        makePosting({ companyName: 'BigCorp', jobTitle: 'Dev 1', url: 'https://test/1' }),
        makePosting({ companyName: 'BigCorp', jobTitle: 'Dev 2', url: 'https://test/2' }),
        makePosting({ companyName: 'BigCorp', jobTitle: 'Dev 3', url: 'https://test/3' }),
      ];

      const signals = adapter.detectSignals(postings);
      const signalTypes = signals.map((s) => s.signalType);

      expect(signalTypes).toContain('multi_offres');
      expect(signals.find((s) => s.signalType === 'multi_offres')?.score).toBe(10);
    });

    it('detects mission_ponctuelle for CDD/freelance postings', () => {
      const adapter = new JobBoardScannerAdapter({
        get: (key: string) => {
          if (key === 'HASDATA_BASE_URL') return 'https://api.hasdata.com';
          return undefined;
        },
      } as never);

      const postings: JobPosting[] = [
        makePosting({ jobTitle: 'Développeur CDD 6 mois', companyName: 'MissionCorp' }),
      ];

      const signals = adapter.detectSignals(postings);
      const signalTypes = signals.map((s) => s.signalType);

      expect(signalTypes).toContain('mission_ponctuelle');
    });

    it('detects startup_debut for first hire keywords', () => {
      const adapter = new JobBoardScannerAdapter({
        get: (key: string) => {
          if (key === 'HASDATA_BASE_URL') return 'https://api.hasdata.com';
          return undefined;
        },
      } as never);

      const postings: JobPosting[] = [
        makePosting({ jobTitle: 'Premier recrutement tech startup', companyName: 'StartupCorp' }),
      ];

      const signals = adapter.detectSignals(postings);
      const signalTypes = signals.map((s) => s.signalType);

      expect(signalTypes).toContain('startup_debut');
    });

    it('returns no signals for unrelated job postings', () => {
      const adapter = new JobBoardScannerAdapter({
        get: (key: string) => {
          if (key === 'HASDATA_BASE_URL') return 'https://api.hasdata.com';
          return undefined;
        },
      } as never);

      const postings: JobPosting[] = [
        makePosting({ jobTitle: 'Comptable senior CDI', companyName: 'FinanceCorp' }),
      ];

      const signals = adapter.detectSignals(postings);

      expect(signals).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('handles $transaction failure gracefully by propagating error', async () => {
      const posting = makePosting();
      mockScanner.searchJobs.mockResolvedValueOnce([posting]);
      mockScanner.detectSignals.mockReturnValueOnce([
        {
          companyName: 'Acme Corp',
          signalType: 'budget_tech_disponible',
          score: 20,
          reason: 'React',
          postings: [posting],
        },
      ]);

      (mockPrisma.$transaction as jest.Mock).mockRejectedValueOnce(
        new Error('DB connection failed'),
      );

      await expect(service.scanJobBoards({ keywords: ['react'] })).rejects.toThrow(
        'DB connection failed',
      );
    });
  });
});
