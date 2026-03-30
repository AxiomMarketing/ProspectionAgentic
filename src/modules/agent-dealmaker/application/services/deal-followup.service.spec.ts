import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { DealFollowUpService } from './deal-followup.service';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { DealStage } from '../../domain/entities/deal.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const createMockPrisma = () => ({
  dealCrm: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  dealActivity: { create: jest.fn(), count: jest.fn() },
  engagementScore: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
});

describe('DealFollowUpService', () => {
  let service: DealFollowUpService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockLlmService: { call: jest.Mock };
  let mockEmailAdapter: { sendEmail: jest.Mock };
  let mockNurturerQueue: { add: jest.Mock };
  let mockDealmakerQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockLlmService = { call: jest.fn() };
    mockEmailAdapter = { sendEmail: jest.fn().mockResolvedValue({ messageId: '1', accepted: [], rejected: [], provider: 'test' }) };
    mockNurturerQueue = { add: jest.fn() };
    mockDealmakerQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealFollowUpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LlmService, useValue: mockLlmService },
        { provide: IEmailAdapter, useValue: mockEmailAdapter },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GMAIL_USER') return 'noreply@axiom-marketing.fr';
              if (key === 'AXIOM_SIRET') return '123456789';
              if (key === 'AXIOM_ADDRESS') return '1 rue Test, Paris';
              if (key === 'UNSUBSCRIBE_BASE_URL') return 'https://unsubscribe.example.com';
              return undefined;
            }),
          },
        },
        { provide: getQueueToken(QUEUE_NAMES.NURTURER_PIPELINE), useValue: mockNurturerQueue },
        { provide: getQueueToken(QUEUE_NAMES.DEALMAKER_PIPELINE), useValue: mockDealmakerQueue },
      ],
    }).compile();

    service = module.get<DealFollowUpService>(DealFollowUpService);
  });

  describe('processFollowUp()', () => {
    it('throws NotFoundException when deal not found', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue(null);
      await expect(service.processFollowUp('deal-001', 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('skips follow-up when deal is in terminal stage (GAGNE)', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue({
        id: 'deal-001',
        stage: DealStage.GAGNE,
        prospect: { email: 'test@example.com', companyName: 'ACME' },
        prospectId: 'p1',
        derniereRelanceAt: null,
      });
      await service.processFollowUp('deal-001', 1);
      expect(mockEmailAdapter.sendEmail).not.toHaveBeenCalled();
    });

    it('skips follow-up when prospect replied less than 48h ago', async () => {
      const recentReply = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockPrisma.dealCrm.findUnique.mockResolvedValue({
        id: 'deal-001',
        stage: DealStage.DEVIS_CREE,
        prospect: { email: 'test@example.com', companyName: 'ACME' },
        prospectId: 'p1',
        derniereRelanceAt: recentReply,
      });
      await service.processFollowUp('deal-001', 1);
      expect(mockEmailAdapter.sendEmail).not.toHaveBeenCalled();
    });

    it('sends email when deal is active and timing is correct', async () => {
      const oldContact = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockPrisma.dealCrm.findUnique.mockResolvedValue({
        id: 'deal-001',
        stage: DealStage.DEVIS_CREE,
        prospect: { email: 'test@example.com', companyName: 'ACME' },
        prospectId: 'p1',
        derniereRelanceAt: oldContact,
      });
      mockPrisma.dealCrm.update.mockResolvedValue({});
      mockPrisma.dealActivity.create.mockResolvedValue({});

      await service.processFollowUp('deal-001', 1);

      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledTimes(1);
      const emailCall = mockEmailAdapter.sendEmail.mock.calls[0][0] as { subject: string };
      expect(emailCall.subject).toContain('Relance J+3');
    });

    it('skips follow-up when prospect has no email', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue({
        id: 'deal-001',
        stage: DealStage.DEVIS_CREE,
        prospect: { email: null, companyName: 'ACME' },
        prospectId: 'p1',
        derniereRelanceAt: null,
      });
      await service.processFollowUp('deal-001', 1);
      expect(mockEmailAdapter.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('trackEngagement()', () => {
    it('creates new engagement score with correct points for meeting_accepte (50 pts)', async () => {
      mockPrisma.engagementScore.findUnique.mockResolvedValue(null);
      mockPrisma.engagementScore.create.mockResolvedValue({});
      mockPrisma.dealActivity.create.mockResolvedValue({});

      await service.trackEngagement('deal-001', 'meeting_accepte');

      expect(mockPrisma.engagementScore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ score: 50 }),
        }),
      );
    });

    it('accumulates points on existing engagement score', async () => {
      mockPrisma.engagementScore.findUnique.mockResolvedValue({ score: 20, signals: [] });
      mockPrisma.engagementScore.update.mockResolvedValue({});
      mockPrisma.dealActivity.create.mockResolvedValue({});

      await service.trackEngagement('deal-001', 'page_pricing');

      expect(mockPrisma.engagementScore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ score: 40 }),
        }),
      );
    });
  });

  describe('classifyObjection()', () => {
    it('returns aucune when LLM confidence is below 0.7', async () => {
      mockLlmService.call.mockResolvedValue({
        content: JSON.stringify({ type: 'prix_eleve', confidence: 0.5 }),
      });
      const result = await service.classifyObjection('Not sure about the price');
      expect(result.type).toBe('aucune');
    });

    it('returns classified objection type with confidence >= 0.7', async () => {
      mockLlmService.call.mockResolvedValue({
        content: JSON.stringify({ type: 'timing', confidence: 0.9 }),
      });
      const result = await service.classifyObjection('We are not ready yet');
      expect(result.type).toBe('timing');
      expect(result.confidence).toBe(0.9);
    });

    it('returns aucune when LLM returns type not in whitelist', async () => {
      mockLlmService.call.mockResolvedValue({
        content: JSON.stringify({ type: 'unknown_injection', confidence: 0.95 }),
      });
      const result = await service.classifyObjection('Some reply');
      expect(result.type).toBe('aucune');
    });

    it('falls back to aucune on JSON parse error', async () => {
      mockLlmService.call.mockResolvedValue({ content: 'not json {{}}' });
      const result = await service.classifyObjection('Some reply');
      expect(result.type).toBe('aucune');
      expect(result.confidence).toBe(0);
    });
  });

  describe('markLost()', () => {
    it('throws NotFoundException when deal not found', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue(null);
      await expect(service.markLost('deal-001', 'Budget cut')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('dispatches to nurturer queue after marking deal lost', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue({
        id: 'deal-001',
        prospectId: 'p-001',
        prospect: { companyName: 'ACME' },
      });
      mockPrisma.dealCrm.update.mockResolvedValue({});
      mockPrisma.dealActivity.create.mockResolvedValue({});

      await service.markLost('deal-001', 'Budget cut');

      expect(mockNurturerQueue.add).toHaveBeenCalledWith(
        'lost-deal-to-nurture',
        expect.objectContaining({ dealId: 'deal-001', lostReason: 'Budget cut' }),
      );
    });
  });
});
