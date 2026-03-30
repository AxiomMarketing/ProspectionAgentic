import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { ReferralService } from './referral.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { PrismaService } from '@core/database/prisma.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { Customer } from '../../domain/entities/customer.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const makeCustomer = (overrides: Partial<Parameters<typeof Customer.reconstitute>[0]> = {}) =>
  Customer.reconstitute({
    id: 'cust-1',
    companyName: 'Dupont Marketing',
    primaryContactId: 'contact-1',
    contractStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    mrrEur: 1000,
    status: 'active',
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
  referralProgram: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  referralLead: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  customerHealthScore: { findFirst: jest.fn() },
  npsSurvey: { findFirst: jest.fn() },
  dealCrm: { findFirst: jest.fn() },
};

const mockEmailAdapter = { sendEmail: jest.fn() };
const mockEventEmitter = { emit: jest.fn() };
const mockVeilleurQueue = { add: jest.fn() };

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    const cfg: Record<string, unknown> = {
      'csm.referralMinHealth': 80,
      'csm.referralMinNps': 9,
      'csm.referralMinDays': 60,
      'GMAIL_USER': 'no-reply@axiom-marketing.fr',
      'APP_URL': 'https://axiom-marketing.fr',
    };
    return cfg[key] ?? def;
  }),
};

describe('ReferralService', () => {
  let service: ReferralService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.referralProgram.findUnique.mockResolvedValue(null);
    mockPrisma.referralLead.findFirst.mockResolvedValue(null);
    mockPrisma.referralLead.count.mockResolvedValue(0);
    mockEmailAdapter.sendEmail.mockResolvedValue({ messageId: 'msg-1', accepted: [], rejected: [], provider: 'test' });
    mockVeilleurQueue.add.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ICustomerRepository, useValue: mockCustomerRepo },
        { provide: IEmailAdapter, useValue: mockEmailAdapter },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentEventLoggerService, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(QUEUE_NAMES.VEILLEUR_REFERRAL_LEADS), useValue: mockVeilleurQueue },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
  });

  // ── generateReferralCode ──────────────────────────────────────────────────

  it('should generate code in AXIOM-XXX-16HEX format', () => {
    const code = service.generateReferralCode('Dupont Marketing');
    expect(code).toMatch(/^AXIOM-[A-Z]{1,3}-[A-F0-9]{16}$/);
  });

  it('should use first letter of each word as abbreviation (max 3 chars)', () => {
    const code = service.generateReferralCode('Alpha Beta Gamma Delta');
    const parts = code.split('-');
    expect(parts[1]).toBe('ABG'); // max 3 chars
  });

  it('should generate unique codes on repeated calls', () => {
    const code1 = service.generateReferralCode('Acme Corp');
    const code2 = service.generateReferralCode('Acme Corp');
    expect(code1).not.toBe(code2);
  });

  // ── inviteToProgram ───────────────────────────────────────────────────────

  it('should create ReferralProgram, send email, and emit referral.invited', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockPrisma.referralProgram.findUnique.mockResolvedValue(null); // no existing program
    mockPrisma.customerHealthScore.findFirst.mockResolvedValue({ healthScore: 85 });
    mockPrisma.npsSurvey.findFirst.mockResolvedValue({ score: 9, type: 'nps', status: 'responded' });
    mockPrisma.dealCrm.findFirst.mockResolvedValue({ id: 'deal-1', amountEur: 10000 });
    mockPrisma.referralProgram.create.mockResolvedValue({
      id: 'prog-1',
      customerId: 'cust-1',
      referralCode: 'AXIOM-DM-AABBCCDD11223344',
      commissionTier: 'tier_1',
      status: 'invited',
    });
    mockPrisma.customer.findUnique.mockResolvedValue({ primaryContactId: 'contact-1' });
    mockPrisma.prospect.findUnique.mockResolvedValue({ firstName: 'Jean', email: 'jean@acme.fr' });

    await service.inviteToProgram('cust-1');

    expect(mockPrisma.referralProgram.create).toHaveBeenCalledTimes(1);
    const createData = mockPrisma.referralProgram.create.mock.calls[0][0].data;
    expect(createData.status).toBe('invited');
    expect(createData.commissionTier).toBe('tier_1'); // acv < 15000 → tier_1
    expect(mockEmailAdapter.sendEmail).toHaveBeenCalledTimes(1);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'referral.invited',
      expect.objectContaining({ customerId: 'cust-1' }),
    );
  });

  it('should throw BadRequestException if program already exists', async () => {
    const customer = makeCustomer();
    mockCustomerRepo.findById.mockResolvedValue(customer);
    mockPrisma.referralProgram.findUnique.mockResolvedValue({ id: 'existing-prog' });

    await expect(service.inviteToProgram('cust-1')).rejects.toThrow(BadRequestException);
  });

  // ── submitReferral ────────────────────────────────────────────────────────

  it('should create lead and dispatch to veilleurQueue with priority 1 and boost 40', async () => {
    const program = {
      id: 'prog-1',
      customerId: 'cust-1',
      referralCode: 'AXIOM-DM-AABBCCDD11223344',
      commissionTier: 'tier_1',
      status: 'active',
      totalReferralsSubmitted: 0,
    };
    mockPrisma.referralProgram.findUnique.mockResolvedValue(program);
    mockPrisma.referralLead.count.mockResolvedValue(0); // under daily limit
    mockPrisma.referralLead.findFirst.mockResolvedValue(null); // no duplicate
    mockPrisma.referralLead.create.mockResolvedValue({
      id: 'lead-1',
      referralProgramId: 'prog-1',
      email: 'prospect@beta.fr',
      status: 'submitted',
    });
    mockPrisma.referralProgram.update.mockResolvedValue({});
    mockPrisma.customer.findUnique.mockResolvedValue({ primaryContactId: 'contact-1' });
    mockPrisma.prospect.findUnique.mockResolvedValue({ firstName: 'Marie', email: 'marie@acme.fr' });

    await service.submitReferral('AXIOM-DM-AABBCCDD11223344', {
      prenom: 'Sophie',
      nom: 'Martin',
      email: 'prospect@beta.fr',
      entreprise: 'Beta SAS',
      besoin: 'Site e-commerce',
    });

    expect(mockVeilleurQueue.add).toHaveBeenCalledWith(
      'referral-lead',
      expect.objectContaining({
        type: 'referral_lead',
        priority_boost: 40,
        metadata: expect.objectContaining({ agent: 'agent_10_csm' }),
      }),
      { priority: 1 },
    );
    expect(mockPrisma.referralLead.create).toHaveBeenCalledTimes(1);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'referral.submitted',
      expect.objectContaining({ referralCode: 'AXIOM-DM-AABBCCDD11223344' }),
    );
  });

  it('should reject submitReferral if daily limit exceeded (> 3 per day)', async () => {
    const program = {
      id: 'prog-1',
      customerId: 'cust-1',
      referralCode: 'AXIOM-DM-AABBCCDD11223344',
      status: 'active',
    };
    mockPrisma.referralProgram.findUnique.mockResolvedValue(program);
    mockPrisma.referralLead.count.mockResolvedValue(3); // at limit

    await expect(
      service.submitReferral('AXIOM-DM-AABBCCDD11223344', {
        prenom: 'X',
        nom: 'Y',
        email: 'x@y.com',
        entreprise: 'Z',
        besoin: 'test',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject submitReferral if email already exists (deduplication)', async () => {
    const program = {
      id: 'prog-1',
      customerId: 'cust-1',
      referralCode: 'AXIOM-DM-AABBCCDD11223344',
      status: 'active',
    };
    mockPrisma.referralProgram.findUnique.mockResolvedValue(program);
    mockPrisma.referralLead.count.mockResolvedValue(0);
    mockPrisma.referralLead.findFirst.mockResolvedValue({ id: 'existing-lead', email: 'dup@test.fr' });

    await expect(
      service.submitReferral('AXIOM-DM-AABBCCDD11223344', {
        prenom: 'A',
        nom: 'B',
        email: 'dup@test.fr',
        entreprise: 'C',
        besoin: 'test',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for unknown referral code', async () => {
    mockPrisma.referralProgram.findUnique.mockResolvedValue(null);

    await expect(
      service.submitReferral('AXIOM-XX-NONEXISTENT0000000', {
        prenom: 'A',
        nom: 'B',
        email: 'a@b.com',
        entreprise: 'C',
        besoin: 'test',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ── validateCommission ────────────────────────────────────────────────────

  it('should return false when amount exceeds per_referral limit (5000)', async () => {
    mockPrisma.referralLead.findMany.mockResolvedValue([]);

    const result = await service.validateCommission('prog-1', 6000);
    expect(result).toBe(false);
  });

  it('should return false when monthly total would exceed 10000', async () => {
    // Existing monthly commissions = 8000, new = 3000 → total 11000 > 10000
    mockPrisma.referralLead.findMany
      .mockResolvedValueOnce([{ commissionAmount: 4000 }, { commissionAmount: 4000 }]) // monthly
      .mockResolvedValueOnce([{ commissionAmount: 4000 }, { commissionAmount: 4000 }]); // annual

    const result = await service.validateCommission('prog-1', 3000);
    expect(result).toBe(false);
  });

  it('should return true when all commission caps are satisfied', async () => {
    // New amount = 2000, monthly existing = 1000, annual existing = 5000
    mockPrisma.referralLead.findMany
      .mockResolvedValueOnce([{ commissionAmount: 1000 }]) // monthly
      .mockResolvedValueOnce([{ commissionAmount: 5000 }]); // annual

    const result = await service.validateCommission('prog-1', 2000);
    expect(result).toBe(true);
  });
});
