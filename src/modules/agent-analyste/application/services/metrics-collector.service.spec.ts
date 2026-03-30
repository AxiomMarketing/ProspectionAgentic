import { Test, TestingModule } from '@nestjs/testing';
import { MetricsCollectorService } from './metrics-collector.service';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

describe('MetricsCollectorService', () => {
  let service: MetricsCollectorService;
  let prisma: jest.Mocked<PrismaService>;

  const mockUpsert = jest.fn();
  const mockGroupBy = jest.fn();
  const mockCount = jest.fn();
  const mockAggregate = jest.fn();
  const mockFindMany = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsCollectorService,
        {
          provide: PrismaService,
          useValue: {
            metriquesDaily: { upsert: mockUpsert },
            rawLead: { groupBy: mockGroupBy, count: mockCount },
            prospectScore: { aggregate: mockAggregate, groupBy: mockGroupBy },
            prospect: { count: mockCount },
            agentEvent: { aggregate: mockAggregate, count: mockCount },
            generatedMessage: { aggregate: mockAggregate },
            messageTemplate: { count: mockCount },
            abTest: { count: mockCount },
            emailSend: { groupBy: mockGroupBy, count: mockCount },
            replyClassification: { groupBy: mockGroupBy, count: mockCount },
            linkedinAction: { groupBy: mockGroupBy },
            prospectSequence: { count: mockCount },
            bounceEvent: { count: mockCount },
            nurtureProspect: { count: mockCount, findMany: mockFindMany, aggregate: mockAggregate },
            nurtureInteraction: { findMany: mockFindMany },
            dealCrm: { groupBy: mockGroupBy, aggregate: mockAggregate },
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test') } },
        { provide: AgentEventLoggerService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<MetricsCollectorService>(MetricsCollectorService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('collectDailySnapshot', () => {
    beforeEach(() => {
      // rawLead groupBy (source) + count (total) + count (duplicates)
      mockGroupBy.mockResolvedValue([{ source: 'linkedin', _count: { id: 5 } }]);
      mockCount.mockResolvedValue(10);
      mockAggregate.mockResolvedValue({ _avg: { totalScore: 60, durationMs: 200, costEur: 0.01, generationMs: 500 }, _count: { id: 5 }, _sum: { amountEur: 100, costEur: 0.05 } });
      mockFindMany.mockResolvedValue([{ opened: true, clicked: false }, { opened: false, clicked: true }]);
      mockUpsert.mockResolvedValue({ id: 'snap-1', dateSnapshot: new Date() });
    });

    it('calls upsert with dateSnapshot', async () => {
      await service.collectDailySnapshot('2026-01-15');

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const call = mockUpsert.mock.calls[0][0];
      expect(call.where.dateSnapshot).toEqual(new Date('2026-01-15'));
    });

    it('upsert create and update have same date', async () => {
      await service.collectDailySnapshot('2026-01-15');

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.dateSnapshot).toEqual(call.where.dateSnapshot);
    });

    it('computes coutTotalJourEur from agent costs', async () => {
      await service.collectDailySnapshot('2026-01-15');

      const call = mockUpsert.mock.calls[0][0];
      expect(typeof call.create.coutTotalJourEur).toBe('number');
    });

    it('uses today date when no date arg provided', async () => {
      await service.collectDailySnapshot();

      const call = mockUpsert.mock.calls[0][0];
      const today = new Date().toISOString().split('T')[0];
      expect(call.where.dateSnapshot).toEqual(new Date(today));
    });
  });

  describe('groupBy calculations', () => {
    it('correctly sums linkedin leads from source groups', async () => {
      mockGroupBy.mockResolvedValue([
        { source: 'linkedin', _count: { id: 7 } },
        { source: 'boamp', _count: { id: 3 } },
      ]);
      mockCount.mockResolvedValue(10);
      mockAggregate.mockResolvedValue({ _avg: { totalScore: 0, durationMs: 0, costEur: 0, generationMs: 0 }, _count: { id: 0 }, _sum: { amountEur: 0, costEur: 0 } });
      mockFindMany.mockResolvedValue([]);
      mockUpsert.mockResolvedValue({});

      await service.collectDailySnapshot('2026-01-15');

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.veilleurLeadsLinkedin).toBe(7);
      expect(call.create.veilleurLeadsMarches).toBe(3);
    });
  });
});
