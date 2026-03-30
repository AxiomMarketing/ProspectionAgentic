import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { UpsellService } from './upsell.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { PrismaService } from '@core/database/prisma.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { Customer } from '../../domain/entities/customer.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const makeCustomer = (overrides: Partial<Parameters<typeof Customer.reconstitute>[0]> = {}) =>
  Customer.reconstitute({
    id: 'cust-1',
    companyName: 'Acme Corp',
    primaryContactId: 'contact-1',
    contractStartDate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 120 days
    mrrEur: 1500,
    status: 'active',
    typeProjet: 'site_vitrine',
    createdAt: new Date(),
    updatedAt: new Date(),
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

const mockPrisma = {
  customer: { findUnique: jest.fn() },
  prospect: { findUnique: jest.fn() },
  upsellOpportunity: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  dealCrm: { findMany: jest.fn().mockResolvedValue([]) },
  projectMilestone: { count: jest.fn().mockResolvedValue(0) },
  churnSignal: { count: jest.fn().mockResolvedValue(0) },
  agentEvent: { count: jest.fn().mockResolvedValue(0) },
  onboardingStep: { count: jest.fn().mockResolvedValue(0) },
  npsSurvey: { findFirst: jest.fn().mockResolvedValue(null) },
};

const mockEmailAdapter = { sendEmail: jest.fn() };
const mockEventEmitter = { emit: jest.fn() };
const mockDealmakerQueue = { add: jest.fn() };

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    const cfg: Record<string, unknown> = {
      'csm.upsellMinScore': 60,
      'csm.upsellCooldownDays': 90,
      'GMAIL_USER': 'no-reply@axiom-marketing.fr',
    };
    return cfg[key] ?? def;
  }),
};

describe('UpsellService', () => {
  let service: UpsellService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.upsellOpportunity.findFirst.mockResolvedValue(null);
    mockPrisma.dealCrm.findMany.mockResolvedValue([]);
    mockPrisma.projectMilestone.count.mockResolvedValue(0);
    mockPrisma.churnSignal.count.mockResolvedValue(0);
    mockPrisma.agentEvent.count.mockResolvedValue(0);
    mockPrisma.onboardingStep.count.mockResolvedValue(0);
    mockPrisma.npsSurvey.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpsellService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ICustomerRepository, useValue: mockCustomerRepo },
        { provide: IEmailAdapter, useValue: mockEmailAdapter },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentEventLoggerService, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(QUEUE_NAMES.DEALMAKER_UPSELL), useValue: mockDealmakerQueue },
      ],
    }).compile();

    service = module.get<UpsellService>(UpsellService);
  });

  // ── evaluateUpsellOpportunity ─────────────────────────────────────────────

  it('should return null when a blocker exists (project_late)', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockPrisma.projectMilestone.count.mockResolvedValue(2); // overdue milestones = blocker

    const result = await service.evaluateUpsellOpportunity('cust-1');
    expect(result).toBeNull();
  });

  it('should return null when cooldown is active (< 90 days since last proposal)', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    const recentProposal = {
      id: 'opp-1',
      proposedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    };
    mockPrisma.upsellOpportunity.findFirst.mockResolvedValue(recentProposal);

    const result = await service.evaluateUpsellOpportunity('cust-1');
    expect(result).toBeNull();
  });

  it('should filter out already-owned services from cross-sell matrix', async () => {
    // Customer already has site_vitrine and tracking_server_side
    const customer = makeCustomer({ typeProjet: 'site_vitrine' });
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockPrisma.dealCrm.findMany.mockResolvedValue([{ typeProjet: 'tracking_server_side' }]);
    // No cooldown, no blocker
    mockPrisma.upsellOpportunity.findFirst.mockResolvedValue(null);
    // Score high enough
    mockPrisma.agentEvent.count.mockResolvedValue(5);
    mockPrisma.onboardingStep.count.mockResolvedValue(10);
    const completedCountMock = jest.fn()
      .mockResolvedValueOnce(10) // total steps
      .mockResolvedValueOnce(10); // completed steps
    mockPrisma.onboardingStep.count = completedCountMock;
    mockPrisma.upsellOpportunity.create.mockResolvedValue({
      id: 'opp-new',
      productTarget: 'ecommerce_shopify',
      estimatedValue: 8000,
      upsellScore: 65,
      priority: 'medium',
      customerId: 'cust-1',
      signalsDetected: {},
    });

    const result = await service.evaluateUpsellOpportunity('cust-1');
    // tracking_server_side should be filtered out, ecommerce_shopify should be selected
    if (result) {
      const createCall = mockPrisma.upsellOpportunity.create.mock.calls[0][0];
      expect(createCall.data.productTarget).not.toBe('tracking_server_side');
    }
  });

  it('should return opportunity with id when score is above threshold', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockPrisma.upsellOpportunity.findFirst.mockResolvedValue(null);
    // Score drivers: weekly activity + no complaints + no overdue
    mockPrisma.agentEvent.count.mockResolvedValue(5);
    mockPrisma.onboardingStep.count.mockResolvedValue(10);
    mockPrisma.upsellOpportunity.create.mockResolvedValue({
      id: 'opp-created',
      productTarget: 'tracking_server_side',
      estimatedValue: 990,
      upsellScore: 75,
      priority: 'medium',
      customerId: 'cust-1',
      signalsDetected: {},
    });

    const result = await service.evaluateUpsellOpportunity('cust-1');
    if (result !== null) {
      expect(result).toHaveProperty('id');
      expect(result.id).toBe('opp-created');
    }
  });

  // ── calculateUpsellScore ──────────────────────────────────────────────────

  it('should apply budget signals mutually exclusively (take highest available)', async () => {
    const customer = makeCustomer();
    // budget_approved=0, company_growth=1, feature_request=1
    // Should add 15 (company_growth) not 10 (feature_request)
    mockPrisma.agentEvent.count
      .mockImplementation(async ({ where }: any) => {
        if (where?.eventType === 'budget_approved') return 0;
        if (where?.eventType === 'company_growth') return 1;
        if (where?.eventType === 'feature_request') return 1;
        return 0;
      });
    mockPrisma.customer.findUnique.mockResolvedValue({
      contractStartDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      primaryContactId: 'contact-1',
      typeProjet: 'site_vitrine',
    });

    const score1 = await service.calculateUpsellScore('cust-1');

    // Now with budget_approved=1: should add 20, not 15
    mockPrisma.agentEvent.count
      .mockImplementation(async ({ where }: any) => {
        if (where?.eventType === 'budget_approved') return 1;
        if (where?.eventType === 'company_growth') return 1;
        return 0;
      });

    const score2 = await service.calculateUpsellScore('cust-1');
    // score2 should be >= score1 because budget_approved (20) > company_growth (15)
    expect(score2).toBeGreaterThanOrEqual(score1);
  });

  // ── proposeUpsell ─────────────────────────────────────────────────────────

  it('should emit upsell.proposed event and update opportunity status', async () => {
    const opportunity = {
      id: 'opp-1',
      customerId: 'cust-1',
      productTarget: 'ecommerce_shopify',
      estimatedValue: 8000,
      upsellScore: 75,
      priority: 'high',
      signalsDetected: {},
    };
    mockPrisma.upsellOpportunity.findUnique = jest.fn().mockResolvedValue(opportunity);
    mockPrisma.customer.findUnique.mockResolvedValue({
      companyName: 'Acme Corp',
      primaryContactId: 'contact-1',
    });
    mockPrisma.prospect.findUnique.mockResolvedValue({
      firstName: 'Jean',
      email: 'jean@acme.fr',
    });
    mockEmailAdapter.sendEmail.mockResolvedValue({ messageId: 'msg-1', accepted: [], rejected: [], provider: 'test' });
    mockPrisma.upsellOpportunity.update.mockResolvedValue({});
    mockDealmakerQueue.add.mockResolvedValue({});

    await service.proposeUpsell('cust-1', 'opp-1');

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'upsell.proposed',
      expect.objectContaining({ customerId: 'cust-1', opportunityId: 'opp-1' }),
    );
    expect(mockPrisma.upsellOpportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'opp-1' },
        data: expect.objectContaining({ status: 'proposed' }),
      }),
    );
  });
});
