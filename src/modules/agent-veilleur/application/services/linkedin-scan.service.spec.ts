import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { LinkedInScanService } from './linkedin-scan.service';
import { NetrowsAdapter } from '../../infrastructure/adapters/linkedin/netrows.adapter';
import { SignalsApiAdapter } from '../../infrastructure/adapters/linkedin/signals-api.adapter';
import { RssFundingAdapter } from '../../infrastructure/adapters/linkedin/rss-funding.adapter';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { LinkedInSignal } from '../../infrastructure/adapters/linkedin/linkedin-signal.interface';

const makeSignal = (overrides: Partial<LinkedInSignal> = {}): LinkedInSignal => ({
  type: 'hiring',
  companyName: 'Acme Corp',
  detail: 'Test signal',
  score: 20,
  detectedAt: new Date(),
  ...overrides,
});

describe('LinkedInScanService', () => {
  let service: LinkedInScanService;
  let mockNetrows: { getJobChanges: jest.Mock; getHeadcountChanges: jest.Mock };
  let mockSignalsApi: { getHiringSignals: jest.Mock };
  let mockRss: { getFundingEvents: jest.Mock };
  let mockPrisma: Record<string, any>;
  let mockQueue: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockNetrows = {
      getJobChanges: jest.fn().mockResolvedValue([]),
      getHeadcountChanges: jest.fn().mockResolvedValue([]),
    };

    mockSignalsApi = {
      getHiringSignals: jest.fn().mockResolvedValue([]),
    };

    mockRss = {
      getFundingEvents: jest.fn().mockResolvedValue([]),
    };

    mockPrisma = {
      rawLead: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: data.id ?? `lead-${Date.now()}`, ...data }),
        ),
      },
    };

    mockQueue = {
      addBulk: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInScanService,
        { provide: NetrowsAdapter, useValue: mockNetrows },
        { provide: SignalsApiAdapter, useValue: mockSignalsApi },
        { provide: RssFundingAdapter, useValue: mockRss },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentEventLoggerService, useValue: { log: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.ENRICHISSEUR_PIPELINE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<LinkedInScanService>(LinkedInScanService);
  });

  describe('signal merging from multiple adapters', () => {
    it('merges signals from all adapters', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ type: 'job_change', companyName: 'Company A', score: 20 }),
      ]);
      mockSignalsApi.getHiringSignals.mockResolvedValue([
        makeSignal({ type: 'hiring', companyName: 'Company B', score: 15 }),
      ]);
      mockRss.getFundingEvents.mockResolvedValue([
        makeSignal({ type: 'funding', companyName: 'Company C', score: 28 }),
      ]);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      expect(mockPrisma.rawLead.create).toHaveBeenCalledTimes(3);
    });

    it('still processes signals when one adapter returns empty array', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ companyName: 'Company A' }),
      ]);
      mockSignalsApi.getHiringSignals.mockResolvedValue([]);
      mockRss.getFundingEvents.mockResolvedValue([]);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      expect(mockPrisma.rawLead.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty API keys — graceful skip', () => {
    it('completes without error when all adapters return empty (no keys configured)', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([]);
      mockNetrows.getHeadcountChanges.mockResolvedValue([]);
      mockSignalsApi.getHiringSignals.mockResolvedValue([]);
      mockRss.getFundingEvents.mockResolvedValue([]);

      await expect(service.scanLinkedIn({ since: new Date().toISOString() })).resolves.not.toThrow();

      expect(mockPrisma.rawLead.create).not.toHaveBeenCalled();
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });

    it('continues processing other adapters when one adapter throws', async () => {
      mockNetrows.getJobChanges.mockRejectedValue(new Error('Network error'));
      mockSignalsApi.getHiringSignals.mockResolvedValue([
        makeSignal({ companyName: 'Surviving Company' }),
      ]);

      await expect(service.scanLinkedIn({ since: new Date().toISOString() })).resolves.not.toThrow();

      expect(mockPrisma.rawLead.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('deduplication by company', () => {
    it('deduplicates signals from the same company across adapters', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ type: 'job_change', companyName: 'Acme Corp', score: 20 }),
      ]);
      mockSignalsApi.getHiringSignals.mockResolvedValue([
        makeSignal({ type: 'hiring', companyName: 'Acme Corp', score: 15 }),
      ]);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      // Only one RawLead created for "Acme Corp" despite two signals
      expect(mockPrisma.rawLead.create).toHaveBeenCalledTimes(1);
      const createdData = mockPrisma.rawLead.create.mock.calls[0][0].data;
      expect(createdData.rawData.signals).toHaveLength(2);
      expect(createdData.rawData.totalScore).toBe(35); // 20 + 15
    });

    it('skips companies already in DB', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ companyName: 'Existing Company' }),
      ]);
      mockPrisma.rawLead.findFirst.mockResolvedValue({ id: 'existing-lead' });

      await service.scanLinkedIn({ since: new Date().toISOString() });

      expect(mockPrisma.rawLead.create).not.toHaveBeenCalled();
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });

    it('creates separate leads for different companies', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ companyName: 'Company Alpha' }),
        makeSignal({ companyName: 'Company Beta' }),
      ]);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      expect(mockPrisma.rawLead.create).toHaveBeenCalledTimes(2);
    });

    it('caps total score at 100 for multiple signals on same company', async () => {
      const signals = Array.from({ length: 10 }, (_, i) =>
        makeSignal({ companyName: 'BigCo', score: 30, type: 'hiring', detail: `Signal ${i}` }),
      );
      mockNetrows.getJobChanges.mockResolvedValue(signals);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      const createdData = mockPrisma.rawLead.create.mock.calls[0][0].data;
      expect(createdData.rawData.totalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('queue dispatch', () => {
    it('dispatches to enrichisseur queue for each new lead', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ companyName: 'Company X', score: 25 }),
      ]);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
      const jobs = mockQueue.addBulk.mock.calls[0][0];
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('enrich-lead');
      expect(jobs[0].data.source).toBe('linkedin');
    });

    it('assigns priority 1 for high-score leads (>=60)', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ companyName: 'Hot Lead', score: 70 }),
      ]);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      const jobs = mockQueue.addBulk.mock.calls[0][0];
      expect(jobs[0].opts.priority).toBe(1);
    });

    it('assigns priority 10 for low-score leads (<40)', async () => {
      mockNetrows.getJobChanges.mockResolvedValue([
        makeSignal({ companyName: 'Cold Lead', score: 15 }),
      ]);

      await service.scanLinkedIn({ since: new Date().toISOString() });

      const jobs = mockQueue.addBulk.mock.calls[0][0];
      expect(jobs[0].opts.priority).toBe(10);
    });
  });
});
