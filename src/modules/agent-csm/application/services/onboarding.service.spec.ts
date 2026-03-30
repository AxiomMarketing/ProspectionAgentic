import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '@core/database/prisma.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = (overrides: Partial<Record<string, any>> = {}) => ({
  onboardingStep: {
    createMany: jest.fn().mockResolvedValue({ count: 12 }),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  },
  onboardingRisk: {
    create: jest.fn().mockResolvedValue({}),
  },
  customer: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'cust-1',
      companyName: 'Acme Corp',
      primaryContactId: 'prospect-1',
      typeProjet: 'site_vitrine',
      deals: [],
    }),
  },
  prospect: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'prospect-1',
      firstName: 'Jean',
      email: 'jean@acme.com',
    }),
  },
  ...overrides,
});

const makeConfig = (overrides: Record<string, any> = {}) => ({
  get: jest.fn((key: string, defaultVal?: any) => {
    const cfg: Record<string, any> = {
      GMAIL_USER: 'no-reply@axiom-marketing.fr',
      ...overrides,
    };
    return cfg[key] ?? defaultVal;
  }),
});

// ─── Base deal data ────────────────────────────────────────────────────────────

const baseDealData = {
  deal_id: '00000000-0000-0000-0000-000000000001',
  prospect_id: '00000000-0000-0000-0000-000000000002',
  prospect: {
    prenom: 'Jean',
    nom: 'Dupont',
    email: 'jean@acme.com',
    poste: 'Directeur',
  },
  entreprise: {
    nom: 'Acme Corp',
  },
  contrat: {
    montant_ht: 8000,
    tier: 'silver' as const,
    type_projet: 'site_vitrine' as const,
    date_signature: '2026-01-01T00:00:00.000Z',
    date_demarrage_prevue: '2026-01-10T00:00:00.000Z',
    duree_estimee_semaines: 8,
    conditions_paiement: '50/50' as const,
  },
  metadata: {
    agent: 'agent_8_dealmaker' as const,
    created_at: '2026-01-01T00:00:00.000Z',
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: ReturnType<typeof makePrisma>;
  let emailAdapter: { sendEmail: jest.Mock; getUnreadReplies: jest.Mock; markAsRead: jest.Mock; isAvailable: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let agentEventLogger: { log: jest.Mock };
  let configService: ReturnType<typeof makeConfig>;

  beforeEach(async () => {
    prisma = makePrisma();
    emailAdapter = {
      sendEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1', accepted: [], rejected: [], provider: 'mock' }),
      getUnreadReplies: jest.fn().mockResolvedValue([]),
      markAsRead: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    eventEmitter = { emit: jest.fn() };
    agentEventLogger = { log: jest.fn() };
    configService = makeConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: IEmailAdapter, useValue: emailAdapter },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AgentEventLoggerService, useValue: agentEventLogger },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── startOnboarding ───────────────────────────────────────────────────────

  describe('startOnboarding', () => {
    it('creates 12 OnboardingStep records for site_vitrine (10 base + 2 specific)', async () => {
      await service.startOnboarding('cust-1', baseDealData);

      expect(prisma.onboardingStep.createMany).toHaveBeenCalledTimes(1);
      const { data } = prisma.onboardingStep.createMany.mock.calls[0][0];
      expect(data).toHaveLength(12);
    });

    it('calculates dueDate as contractStartDate + dayOffset for each step', async () => {
      await service.startOnboarding('cust-1', baseDealData);

      const { data } = prisma.onboardingStep.createMany.mock.calls[0][0];
      const contractStart = new Date('2026-01-10T00:00:00.000Z');

      // welcome_email is dayOffset=0 → same day
      const welcomeStep = data.find((s: any) => s.stepId === 'welcome_email');
      expect(welcomeStep).toBeDefined();
      const welcomeDue = new Date(welcomeStep.dueDate);
      expect(welcomeDue.toDateString()).toBe(contractStart.toDateString());

      // kickoff_scheduled is dayOffset=2
      const kickoffStep = data.find((s: any) => s.stepId === 'kickoff_scheduled');
      expect(kickoffStep).toBeDefined();
      const expectedKickoffDue = new Date(contractStart);
      expectedKickoffDue.setDate(expectedKickoffDue.getDate() + 2);
      expect(new Date(kickoffStep.dueDate).toDateString()).toBe(expectedKickoffDue.toDateString());
    });

    it('includes site_vitrine project-specific steps (brand_review, content_received)', async () => {
      await service.startOnboarding('cust-1', baseDealData);

      const { data } = prisma.onboardingStep.createMany.mock.calls[0][0];
      const stepIds = data.map((s: any) => s.stepId);
      expect(stepIds).toContain('brand_review');
      expect(stepIds).toContain('content_received');
    });

    it("emits 'onboarding.started' event with customerId and typeProjet", async () => {
      await service.startOnboarding('cust-1', baseDealData);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'onboarding.started',
        expect.objectContaining({
          customerId: 'cust-1',
          typeProjet: 'site_vitrine',
        }),
      );
    });
  });

  // ─── executeStep ──────────────────────────────────────────────────────────

  describe('executeStep', () => {
    it('sends email and updates status to completed for welcome_email step', async () => {
      prisma.onboardingStep.findFirst.mockResolvedValue({
        id: 'step-1',
        customerId: 'cust-1',
        stepId: 'welcome_email',
        name: 'Email de bienvenue',
        status: 'pending',
        dueDate: new Date(),
      });

      await service.executeStep('cust-1', 'welcome_email');

      expect(emailAdapter.sendEmail).toHaveBeenCalledTimes(1);
      expect(prisma.onboardingStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-1' },
          data: expect.objectContaining({ status: 'completed' }),
        }),
      );
    });

    it('does not send email for non-email step (shared_folder)', async () => {
      prisma.onboardingStep.findFirst.mockResolvedValue({
        id: 'step-2',
        customerId: 'cust-1',
        stepId: 'shared_folder',
        name: 'Dossier partagé créé',
        status: 'pending',
        dueDate: new Date(),
      });

      await service.executeStep('cust-1', 'shared_folder');

      expect(emailAdapter.sendEmail).not.toHaveBeenCalled();
      expect(prisma.onboardingStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'completed' }),
        }),
      );
    });

    it('is idempotent — skips if step is already completed', async () => {
      prisma.onboardingStep.findFirst.mockResolvedValue({
        id: 'step-1',
        customerId: 'cust-1',
        stepId: 'welcome_email',
        name: 'Email de bienvenue',
        status: 'completed',
        dueDate: new Date(),
      });

      await service.executeStep('cust-1', 'welcome_email');

      expect(emailAdapter.sendEmail).not.toHaveBeenCalled();
      expect(prisma.onboardingStep.update).not.toHaveBeenCalled();
    });

    it('returns early without error when step not found', async () => {
      prisma.onboardingStep.findFirst.mockResolvedValue(null);

      await expect(service.executeStep('cust-1', 'nonexistent_step')).resolves.not.toThrow();
      expect(prisma.onboardingStep.update).not.toHaveBeenCalled();
    });
  });

  // ─── checkAtRiskOnboardings ───────────────────────────────────────────────

  describe('checkAtRiskOnboardings', () => {
    it('creates OnboardingRisk with severity=high for kickoff_done overdue 8 days', async () => {
      const overdueDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      prisma.onboardingStep.findMany.mockResolvedValue([
        {
          id: 'step-3',
          customerId: 'cust-1',
          stepId: 'kickoff_done',
          dueDate: overdueDate,
          customer: { id: 'cust-1' },
        },
      ]);

      await service.checkAtRiskOnboardings();

      expect(prisma.onboardingRisk.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-1',
            riskType: 'kickoff_done',
            severity: 'high',
          }),
        }),
      );
    });

    it("emits 'onboarding.critical' for kickoff_done overdue 14+ days", async () => {
      const criticalOverdueDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      prisma.onboardingStep.findMany.mockResolvedValue([
        {
          id: 'step-4',
          customerId: 'cust-1',
          stepId: 'kickoff_done',
          dueDate: criticalOverdueDate,
          customer: { id: 'cust-1' },
        },
      ]);

      await service.checkAtRiskOnboardings();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'onboarding.critical',
        expect.objectContaining({ customerId: 'cust-1', severity: 'critical' }),
      );
    });

    it("emits 'onboarding.at_risk' for medium/high severity risks", async () => {
      const overdueDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      prisma.onboardingStep.findMany.mockResolvedValue([
        {
          id: 'step-5',
          customerId: 'cust-1',
          stepId: 'assets_collected',
          dueDate: overdueDate,
          customer: { id: 'cust-1' },
        },
      ]);

      await service.checkAtRiskOnboardings();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'onboarding.at_risk',
        expect.objectContaining({ customerId: 'cust-1', stepId: 'assets_collected' }),
      );
    });

    it('does nothing when no overdue steps exist', async () => {
      prisma.onboardingStep.findMany.mockResolvedValue([]);

      await service.checkAtRiskOnboardings();

      expect(prisma.onboardingRisk.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
