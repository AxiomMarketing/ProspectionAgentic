import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CsmService } from './csm.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { OnboardingService } from './onboarding.service';
import { SatisfactionService } from './satisfaction.service';
import { UpsellService } from './upsell.service';
import { ReviewService } from './review.service';
import { ReferralService } from './referral.service';
import { Customer } from '../../domain/entities/customer.entity';
import { DealToCSMDto } from '../dtos/deal-to-csm.dto';

// ─── Factories ───────────────────────────────────────────────────────────────

const makeCustomer = (overrides: Partial<ReturnType<Customer['toPlainObject']>> = {}) =>
  Customer.reconstitute({
    id: 'cust-1',
    companyName: 'Acme Corp',
    siren: '123456789',
    primaryContactId: 'prospect-1',
    contractStartDate: new Date('2025-01-01'),
    mrrEur: 1000,
    plan: 'gold',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const makeDealToCSMDto = (overrides: Partial<DealToCSMDto> = {}): DealToCSMDto => ({
  deal_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  prospect_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  prospect: {
    prenom: 'Jean',
    nom: 'Dupont',
    email: 'jean@acme.fr',
    poste: 'CEO',
  },
  entreprise: {
    nom: 'Acme Corp',
    siret: '123456789',
  },
  contrat: {
    montant_ht: 5000,
    tier: 'gold',
    type_projet: 'site_vitrine',
    date_signature: '2025-03-01T00:00:00.000Z',
    date_demarrage_prevue: '2025-03-15T00:00:00.000Z',
    duree_estimee_semaines: 8,
    conditions_paiement: '50/50',
    scope_detaille: ['design', 'dev', 'seo'],
  },
  notes_vente: 'Client prioritaire',
  metadata: {
    agent: 'agent_8_dealmaker',
    created_at: '2025-03-01T00:00:00.000Z',
    deal_cycle_days: 30,
    engagement_score_final: 85,
  },
  ...overrides,
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCustomerRepo = {
  findById: jest.fn(),
  findBySiren: jest.fn(),
  findActive: jest.fn(),
  findChurnRisk: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockEventEmitter = { emit: jest.fn() };
const mockAgentEventLogger = { log: jest.fn().mockResolvedValue(undefined) };

const mockOnboardingService = {
  startOnboarding: jest.fn().mockResolvedValue(undefined),
  checkAtRiskOnboardings: jest.fn().mockResolvedValue(undefined),
};

const mockSatisfactionService = {
  calculateHealthScore: jest.fn(),
  detectChurnSignals: jest.fn(),
  checkAllCustomersHealth: jest.fn().mockResolvedValue(undefined),
};

const mockUpsellService = {
  evaluateUpsellOpportunity: jest.fn(),
};

const mockReviewService = {
  requestReviews: jest.fn().mockResolvedValue(undefined),
  respondToNegativeReview: jest.fn().mockResolvedValue(undefined),
};

const mockReferralService = {
  inviteToProgram: jest.fn().mockResolvedValue(undefined),
  submitReferral: jest.fn(),
};

const mockPrisma = {
  customer: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  customerHealthScore: { findMany: jest.fn() },
  onboardingStep: { findMany: jest.fn() },
  npsSurvey: { findMany: jest.fn() },
  upsellOpportunity: { findMany: jest.fn() },
  reviewRequest: { findMany: jest.fn() },
  referralProgram: { findMany: jest.fn() },
  referralLead: { findMany: jest.fn() },
  negativeReview: { findMany: jest.fn() },
  csmMetricsDaily: { findFirst: jest.fn() },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CsmService', () => {
  let service: CsmService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsmService,
        { provide: ICustomerRepository, useValue: mockCustomerRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentEventLoggerService, useValue: mockAgentEventLogger },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: SatisfactionService, useValue: mockSatisfactionService },
        { provide: UpsellService, useValue: mockUpsellService },
        { provide: ReviewService, useValue: mockReviewService },
        { provide: ReferralService, useValue: mockReferralService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CsmService>(CsmService);
  });

  // ─── onboardCustomer ───────────────────────────────────────────────────────

  describe('onboardCustomer', () => {
    it('should create customer with status onboarding and all enriched fields', async () => {
      const saved = makeCustomer({ status: 'onboarding' });
      mockCustomerRepo.save.mockResolvedValue(saved);

      const dto = makeDealToCSMDto();
      const result = await service.onboardCustomer(dto);

      expect(result.status).toBe('onboarding');
      expect(mockCustomerRepo.save).toHaveBeenCalledTimes(1);
      const savedArg: Customer = mockCustomerRepo.save.mock.calls[0][0];
      expect(savedArg.companyName).toBe('Acme Corp');
      expect(savedArg.typeProjet).toBe('site_vitrine');
      expect(savedArg.tier).toBe('gold');
      expect(savedArg.dealCycleDays).toBe(30);
      expect(savedArg.engagementScoreFinal).toBe(85);
      expect(savedArg.conditionsPaiement).toBe('50/50');
    });

    it('should emit customer.onboarded event with customerId and dealId', async () => {
      const saved = makeCustomer({ status: 'onboarding' });
      mockCustomerRepo.save.mockResolvedValue(saved);

      const dto = makeDealToCSMDto();
      await service.onboardCustomer(dto);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'customer.onboarded',
        expect.objectContaining({
          customerId: saved.id,
          dealId: dto.deal_id,
        }),
      );
    });

    it('should call onboardingService.startOnboarding after saving', async () => {
      const saved = makeCustomer({ status: 'onboarding' });
      mockCustomerRepo.save.mockResolvedValue(saved);

      const dto = makeDealToCSMDto();
      await service.onboardCustomer(dto);

      expect(mockOnboardingService.startOnboarding).toHaveBeenCalledWith(saved.id, dto);
    });

    it('should log customer_onboarded event', async () => {
      const saved = makeCustomer({ status: 'onboarding' });
      mockCustomerRepo.save.mockResolvedValue(saved);

      await service.onboardCustomer(makeDealToCSMDto());

      expect(mockAgentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'csm',
          eventType: 'customer_onboarded',
        }),
      );
    });
  });

  // ─── calculateHealthScore ──────────────────────────────────────────────────

  describe('calculateHealthScore', () => {
    it('should delegate to satisfactionService.calculateHealthScore', async () => {
      const mockResult = { healthScore: 75, healthLabel: 'yellow' };
      mockSatisfactionService.calculateHealthScore.mockResolvedValue(mockResult);

      const result = await service.calculateHealthScore('cust-1');

      expect(mockSatisfactionService.calculateHealthScore).toHaveBeenCalledWith('cust-1');
      expect(result).toBe(mockResult);
    });

    it('should propagate errors from satisfactionService', async () => {
      mockSatisfactionService.calculateHealthScore.mockRejectedValue(
        new Error('Customer not found'),
      );

      await expect(service.calculateHealthScore('ghost-id')).rejects.toThrow('Customer not found');
    });
  });

  // ─── predictChurn ──────────────────────────────────────────────────────────

  describe('predictChurn', () => {
    it('should return at-risk customers from Prisma', async () => {
      const atRiskCustomers = [
        { id: 'cust-1', companyName: 'Acme', healthScores: [], churnSignals: [{ id: 'sig-1' }] },
      ];
      mockPrisma.customer.findMany.mockResolvedValue(atRiskCustomers);

      const result = await service.predictChurn();

      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'active' } }),
      );
      expect(result).toHaveLength(1);
    });

    it('should filter out customers with healthy scores and no churn signals', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([
        { id: 'cust-1', companyName: 'Healthy Co', healthScores: [{ healthScore: 85 }], churnSignals: [] },
        { id: 'cust-2', companyName: 'At Risk', healthScores: [{ healthScore: 30 }], churnSignals: [] },
      ]);

      const result = await service.predictChurn();

      expect(result).toHaveLength(1);
      expect((result[0] as any).companyName).toBe('At Risk');
    });
  });

  // ─── evaluateUpsell ────────────────────────────────────────────────────────

  describe('evaluateUpsell', () => {
    it('should delegate to upsellService.evaluateUpsellOpportunity', async () => {
      const mockOpp = { id: 'opp-1' };
      mockUpsellService.evaluateUpsellOpportunity.mockResolvedValue(mockOpp);

      const result = await service.evaluateUpsell('cust-1');

      expect(mockUpsellService.evaluateUpsellOpportunity).toHaveBeenCalledWith('cust-1');
      expect(result).toBe(mockOpp);
    });
  });

  // ─── requestReviews ────────────────────────────────────────────────────────

  describe('requestReviews', () => {
    it('should delegate to reviewService.requestReviews', async () => {
      await service.requestReviews('cust-1', 9);

      expect(mockReviewService.requestReviews).toHaveBeenCalledWith('cust-1', 9);
    });
  });

  // ─── inviteToReferral ──────────────────────────────────────────────────────

  describe('inviteToReferral', () => {
    it('should delegate to referralService.inviteToProgram', async () => {
      await service.inviteToReferral('cust-1');

      expect(mockReferralService.inviteToProgram).toHaveBeenCalledWith('cust-1');
    });
  });

  // ─── dailyHealthSnapshot ───────────────────────────────────────────────────

  describe('dailyHealthSnapshot', () => {
    it('should delegate to satisfactionService.checkAllCustomersHealth', async () => {
      await service.dailyHealthSnapshot();

      expect(mockSatisfactionService.checkAllCustomersHealth).toHaveBeenCalledTimes(1);
    });
  });

  // ─── checkOnboardingRisks ──────────────────────────────────────────────────

  describe('checkOnboardingRisks', () => {
    it('should delegate to onboardingService.checkAtRiskOnboardings', async () => {
      await service.checkOnboardingRisks();

      expect(mockOnboardingService.checkAtRiskOnboardings).toHaveBeenCalledTimes(1);
    });
  });
});
