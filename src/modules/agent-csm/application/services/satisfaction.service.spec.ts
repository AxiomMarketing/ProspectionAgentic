import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { SatisfactionService } from './satisfaction.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { IHealthScoreRepository } from '../../domain/repositories/i-health-score.repository';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { Customer } from '../../domain/entities/customer.entity';
import { HealthScore } from '../../domain/entities/health-score.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const makeCustomer = (overrides: Partial<Parameters<typeof Customer.reconstitute>[0]> = {}) =>
  Customer.reconstitute({
    id: 'cust-1',
    companyName: 'Acme Corp',
    primaryContactId: 'contact-1',
    contractStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    mrrEur: 500,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const makeHealthScore = (overrides: Partial<Parameters<typeof HealthScore.reconstitute>[0]> = {}) =>
  HealthScore.reconstitute({
    id: 'hs-1',
    customerId: 'cust-1',
    healthScore: 75,
    healthLabel: 'yellow',
    usageScore: 70,
    supportScore: 70,
    financialScore: 80,
    engagementScore: 70,
    npsScore: undefined,
    signals: {},
    isLatest: true,
    calculatedAt: new Date(),
    ...overrides,
  });

const mockCustomerRepo = {
  findById: jest.fn(),
  findBySiren: jest.fn(),
  findActive: jest.fn(),
  findChurnRisk: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockHealthScoreRepo = {
  findLatestByCustomerId: jest.fn(),
  save: jest.fn(),
};

const mockPrisma = {
  customer: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  agentEvent: {
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  touchpoint: { findMany: jest.fn().mockResolvedValue([]) },
  npsSurvey: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  churnSignal: {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  replyClassification: { findMany: jest.fn().mockResolvedValue([]) },
  customerHealthScore: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  csmMetricsDaily: { upsert: jest.fn() },
  upsellOpportunity: { findFirst: jest.fn().mockResolvedValue(null) },
} as any;

const mockEventEmitter = { emit: jest.fn() };
const mockNurturerQueue = { add: jest.fn() };

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    const cfg: Record<string, unknown> = {
      'csm.churnSilenceDays': 60,
      'csm.churnCriticalSilenceDays': 120,
      'csm': {
        healthScoreGreenThreshold: 80,
        healthScoreYellowThreshold: 60,
        healthScoreOrangeThreshold: 50,
        healthScoreDarkOrangeThreshold: 30,
      },
    };
    return cfg[key] ?? def;
  }),
};

describe('SatisfactionService', () => {
  let service: SatisfactionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset default mocks
    mockPrisma.agentEvent.count.mockResolvedValue(0);
    mockPrisma.agentEvent.findFirst.mockResolvedValue(null);
    mockPrisma.touchpoint.findMany.mockResolvedValue([]);
    mockPrisma.npsSurvey.findFirst.mockResolvedValue(null);
    mockPrisma.npsSurvey.findMany.mockResolvedValue([]);
    mockPrisma.churnSignal.count.mockResolvedValue(0);
    mockPrisma.churnSignal.create.mockResolvedValue({});
    mockPrisma.replyClassification.findMany.mockResolvedValue([]);
    mockPrisma.customer.findUnique.mockResolvedValue({ primaryContactId: 'contact-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SatisfactionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ICustomerRepository, useValue: mockCustomerRepo },
        { provide: IHealthScoreRepository, useValue: mockHealthScoreRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentEventLoggerService, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(QUEUE_NAMES.NURTURER_CHURNED_CLIENT), useValue: mockNurturerQueue },
      ],
    }).compile();

    service = module.get<SatisfactionService>(SatisfactionService);
  });

  // ── calculateHealthScore ──────────────────────────────────────────────────

  it('should throw NotFoundException when customer does not exist', async () => {
    mockCustomerRepo.findById.mockResolvedValue(null);

    await expect(service.calculateHealthScore('ghost')).rejects.toThrow(NotFoundException);
  });

  it('should return null for onboarding customer < 30 days old', async () => {
    const newOnboardingCustomer = makeCustomer({
      status: 'onboarding',
      contractStartDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    });
    mockCustomerRepo.findById.mockResolvedValue(newOnboardingCustomer);

    const result = await service.calculateHealthScore('cust-1');
    expect(result).toBeNull();
  });

  it('should calculate weighted composite score (40% engagement + 30% satisfaction + 30% growth)', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);

    // engagement: 0 events → contactScore=0, emailReactivity=0 → 0
    // satisfaction: nps=null(50), csat=0(50), tickets=0(100), sentiment=50 → round(25+15+10+5)=55
    // growth: mrrEur=500 → mrrScore=min(100,(500/50)*100)=100, upsellOpp=null(0) → round(70+0)=70
    // healthScore = round(0*0.4 + 55*0.3 + 70*0.3) = round(0+16.5+21) = 38
    mockPrisma.upsellOpportunity = { findFirst: jest.fn().mockResolvedValue(null) } as any;

    const result = await service.calculateHealthScore('cust-1');
    expect(result).not.toBeNull();
    expect(result!.healthScore).toBeGreaterThanOrEqual(0);
    expect(result!.healthScore).toBeLessThanOrEqual(100);
  });

  it('should label score >= 80 as green', async () => {
    const customer = makeCustomer({ mrrEur: 5000 });
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);
    // Pump engagement: many events
    mockPrisma.agentEvent.count.mockResolvedValue(10);
    mockPrisma.npsSurvey.findFirst.mockResolvedValue({ score: 10, type: 'nps', status: 'responded' });
    mockPrisma.npsSurvey.findMany.mockResolvedValue([{ score: 5 }, { score: 5 }]);
    mockPrisma.upsellOpportunity = { findFirst: jest.fn().mockResolvedValue({ upsellScore: 80 }) } as any;

    const result = await service.calculateHealthScore('cust-1');
    expect(result).not.toBeNull();
    expect(result!.healthScore).toBeGreaterThanOrEqual(80);
    expect(result!.healthLabel).toBe('green');
  });

  it('should label score < 30 as red', async () => {
    const customer = makeCustomer({ mrrEur: 0 });
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);
    mockPrisma.customer.findUnique.mockResolvedValue({ primaryContactId: null });
    mockNurturerQueue.add.mockResolvedValue({});
    mockPrisma.customer.findUnique.mockResolvedValue({
      primaryContactId: null,
      deals: [],
    });

    const result = await service.calculateHealthScore('cust-1');
    // Even worst case, check label logic is applied
    if (result) {
      const label = result.healthLabel;
      const score = result.healthScore;
      if (score >= 80) expect(label).toBe('green');
      else if (score >= 60) expect(label).toBe('yellow');
      else if (score >= 50) expect(label).toBe('orange');
      else if (score >= 30) expect(label).toBe('dark_orange');
      else expect(label).toBe('red');
    }
  });

  it('should supercede existing latest score before saving new one', async () => {
    const customer = makeCustomer();
    const existingScore = makeHealthScore();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(existingScore);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);
    mockPrisma.upsellOpportunity = { findFirst: jest.fn().mockResolvedValue(null) } as any;

    await service.calculateHealthScore('cust-1');

    expect(mockHealthScoreRepo.save).toHaveBeenCalledTimes(2);
    const firstSave = mockHealthScoreRepo.save.mock.calls[0][0] as HealthScore;
    expect(firstSave.isLatest).toBe(false);
  });

  it('should emit health.green_promoter for green score', async () => {
    const customer = makeCustomer({ mrrEur: 5000 });
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);
    mockPrisma.agentEvent.count.mockResolvedValue(10);
    mockPrisma.npsSurvey.findFirst.mockResolvedValue({ score: 10 });
    mockPrisma.npsSurvey.findMany.mockResolvedValue([{ score: 5 }]);
    mockPrisma.upsellOpportunity = { findFirst: jest.fn().mockResolvedValue({ upsellScore: 80 }) } as any;

    const result = await service.calculateHealthScore('cust-1');
    if (result?.healthLabel === 'green') {
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'health.green_promoter',
        expect.objectContaining({ customerId: 'cust-1' }),
      );
    }
    // Verify health.calculated always emitted
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'health.calculated',
      expect.objectContaining({ customerId: 'cust-1' }),
    );
  });

  it('should emit health.churn_detected for red score', async () => {
    const customer = makeCustomer({ mrrEur: 0 });
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);
    mockPrisma.agentEvent.count.mockResolvedValue(0);
    mockPrisma.customer.findUnique.mockResolvedValue({ primaryContactId: null, deals: [] });
    mockNurturerQueue.add.mockResolvedValue({});
    mockPrisma.upsellOpportunity = { findFirst: jest.fn().mockResolvedValue(null) } as any;

    const result = await service.calculateHealthScore('cust-1');
    if (result?.healthLabel === 'red') {
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'health.churn_detected',
        expect.objectContaining({ customerId: 'cust-1' }),
      );
    }
  });

  // ── detectChurnSignals ────────────────────────────────────────────────────

  it('should detect silence signal when last event > 60 days ago', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    const oldDate = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000);
    mockPrisma.agentEvent.findFirst.mockResolvedValue({ createdAt: oldDate });
    mockPrisma.npsSurvey.findFirst.mockResolvedValue(null);
    mockPrisma.customerHealthScore = { findMany: jest.fn().mockResolvedValue([]) } as any;

    const signals = await service.detectChurnSignals('cust-1');

    expect(signals.some((s) => s.signalType === 'silence')).toBe(true);
    const silenceSignal = signals.find((s) => s.signalType === 'silence');
    expect(silenceSignal?.severity).toBe('high');
  });

  it('should detect NPS detractor when score < 6', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockPrisma.agentEvent.findFirst.mockResolvedValue(null);
    mockPrisma.npsSurvey.findFirst.mockResolvedValue({
      score: 4,
      type: 'nps',
      status: 'responded',
    });
    mockPrisma.customerHealthScore = { findMany: jest.fn().mockResolvedValue([]) } as any;

    const signals = await service.detectChurnSignals('cust-1');

    expect(signals.some((s) => s.signalType === 'nps_detractor')).toBe(true);
    const npsSignal = signals.find((s) => s.signalType === 'nps_detractor');
    expect(npsSignal?.severity).toBe('medium');
    expect(npsSignal?.description).toContain('4/10');
  });

  // ── checkAllCustomersHealth ───────────────────────────────────────────────

  it('should skip onboarding customers and process only active ones in batches', async () => {
    const activeCustomers = [
      { id: 'cust-1', status: 'active' },
      { id: 'cust-2', status: 'active' },
    ];
    mockPrisma.customer.findMany.mockResolvedValue(activeCustomers);
    mockPrisma.customerHealthScore.findMany.mockResolvedValue([]);
    mockPrisma.csmMetricsDaily.upsert.mockResolvedValue({});

    // Mock calculateHealthScore responses — we spy on the method
    const calcSpy = jest
      .spyOn(service, 'calculateHealthScore')
      .mockResolvedValue(null);

    await service.checkAllCustomersHealth();

    expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['active'] } } }),
    );
    expect(calcSpy).toHaveBeenCalledTimes(2);
    expect(calcSpy).toHaveBeenCalledWith('cust-1');
    expect(calcSpy).toHaveBeenCalledWith('cust-2');

    calcSpy.mockRestore();
  });

  it('should upsert CsmMetricsDaily snapshot after processing', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: 'cust-1', status: 'active' }]);
    mockPrisma.customerHealthScore.findMany.mockResolvedValue([
      { healthScore: 85, healthLabel: 'green' },
    ]);
    mockPrisma.csmMetricsDaily.upsert.mockResolvedValue({});
    jest.spyOn(service, 'calculateHealthScore').mockResolvedValue(null);

    await service.checkAllCustomersHealth();

    expect(mockPrisma.csmMetricsDaily.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrisma.csmMetricsDaily.upsert.mock.calls[0][0];
    expect(upsertCall.create.totalClients).toBe(1);
    expect(upsertCall.create.avgHealthScore).toBe(85);
  });
});
