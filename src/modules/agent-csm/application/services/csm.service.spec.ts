import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CsmService } from './csm.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { IHealthScoreRepository } from '../../domain/repositories/i-health-score.repository';
import { PrismaService } from '@core/database/prisma.service';
import { Customer } from '../../domain/entities/customer.entity';
import { HealthScore } from '../../domain/entities/health-score.entity';

const mockCustomer = Customer.reconstitute({
  id: 'cust-1',
  companyName: 'Acme Corp',
  siren: '123456789',
  primaryContactId: undefined,
  contractStartDate: new Date('2025-01-01'),
  mrrEur: 1000,
  plan: 'gold',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockHealthScore = HealthScore.reconstitute({
  id: 'hs-1',
  customerId: 'cust-1',
  healthScore: 75,
  healthLabel: 'yellow',
  usageScore: 70,
  supportScore: 70,
  financialScore: 100,
  engagementScore: 70,
  npsScore: undefined,
  signals: {},
  isLatest: true,
  calculatedAt: new Date(),
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
  agentEvent: { count: jest.fn() },
  customer: { findMany: jest.fn() },
  prospect: { findUnique: jest.fn(), update: jest.fn() },
  rgpdBlacklist: { findFirst: jest.fn() },
  prospectScore: { count: jest.fn() },
  emailSend: { count: jest.fn() },
  dealCrm: { count: jest.fn() },
  nurtureProspect: { findMany: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  metriquesDaily: { findMany: jest.fn(), createMany: jest.fn() },
};

const mockEventEmitter = { emit: jest.fn() };

describe('CsmService', () => {
  let service: CsmService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsmService,
        { provide: ICustomerRepository, useValue: mockCustomerRepo },
        { provide: IHealthScoreRepository, useValue: mockHealthScoreRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CsmService>(CsmService);
  });

  // ---- onboardCustomer ----

  it('should create customer with status active', async () => {
    mockCustomerRepo.save.mockImplementation(async (c: Customer) => c);

    const dto = { companyName: 'Acme Corp', mrrEur: 500 };
    const result = await service.onboardCustomer(dto);

    expect(result.status).toBe('active');
    expect(result.companyName).toBe('Acme Corp');
    expect(mockCustomerRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should emit customer.onboarded event after onboarding', async () => {
    mockCustomerRepo.save.mockImplementation(async (c: Customer) => c);

    await service.onboardCustomer({ companyName: 'Beta Inc', mrrEur: 200 });

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'customer.onboarded',
      expect.objectContaining({ customerId: expect.any(String) }),
    );
  });

  // ---- calculateHealthScore ----

  it('should throw NotFoundException when customer does not exist', async () => {
    mockCustomerRepo.findById.mockResolvedValue(null);

    await expect(service.calculateHealthScore('ghost-id')).rejects.toThrow(NotFoundException);
  });

  it('should calculate health score using 40/30/30 weights', async () => {
    // engagement = min(100, agentEvents * 10), mocked to 3 events → 30
    // satisfaction = 70 (hardcoded)
    // growth = min(100, mrrEur/10) = min(100, 1000/10) = 100
    // healthScore = round(30*0.4 + 70*0.3 + 100*0.3) = round(12 + 21 + 30) = 63
    mockCustomerRepo.findById.mockResolvedValue(mockCustomer);
    mockPrisma.agentEvent.count.mockResolvedValue(3);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);

    const result = await service.calculateHealthScore('cust-1');

    expect(result.healthScore).toBe(63);
  });

  it('should label health score 80+ as green', async () => {
    // engagement = 10 events → 100, satisfaction = 70, growth = min(100, 5000/10)=100
    // healthScore = round(100*0.4 + 70*0.3 + 100*0.3) = round(40+21+30) = 91
    const richCustomer = Customer.reconstitute({
      ...mockCustomer.toPlainObject(),
      mrrEur: 5000,
    });
    mockCustomerRepo.findById.mockResolvedValue(richCustomer);
    mockPrisma.agentEvent.count.mockResolvedValue(10);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);

    const result = await service.calculateHealthScore('cust-1');

    expect(result.healthScore).toBeGreaterThanOrEqual(80);
    expect(result.healthLabel).toBe('green');
  });

  it('should label health score 60-79 as yellow', async () => {
    // engagement=3 events → 30, satisfaction=70, growth=min(100,1000/10)=100
    // healthScore = round(30*0.4 + 70*0.3 + 100*0.3) = 63 → yellow
    mockCustomerRepo.findById.mockResolvedValue(mockCustomer);
    mockPrisma.agentEvent.count.mockResolvedValue(3);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(null);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);

    const result = await service.calculateHealthScore('cust-1');

    expect(result.healthScore).toBeGreaterThanOrEqual(60);
    expect(result.healthScore).toBeLessThan(80);
    expect(result.healthLabel).toBe('yellow');
  });

  it('should supercede existing health score before saving new one', async () => {
    mockCustomerRepo.findById.mockResolvedValue(mockCustomer);
    mockPrisma.agentEvent.count.mockResolvedValue(3);
    mockHealthScoreRepo.findLatestByCustomerId.mockResolvedValue(mockHealthScore);
    mockHealthScoreRepo.save.mockImplementation(async (hs: HealthScore) => hs);

    await service.calculateHealthScore('cust-1');

    // save should be called twice: once for superceded, once for new
    expect(mockHealthScoreRepo.save).toHaveBeenCalledTimes(2);
    const firstCall = mockHealthScoreRepo.save.mock.calls[0][0] as HealthScore;
    expect(firstCall.isLatest).toBe(false);
  });
});
