import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { DealmakerService } from './dealmaker.service';
import { IDealRepository } from '../../domain/repositories/i-deal.repository';
import { IQuoteRepository } from '../../domain/repositories/i-quote.repository';
import { Deal, DealStage } from '../../domain/entities/deal.entity';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteGeneratorService } from './quote-generator.service';
import { DealFollowUpService } from './deal-followup.service';
import { YousignService } from './yousign.service';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

describe('DealmakerService', () => {
  let service: DealmakerService;
  let mockDealRepository: jest.Mocked<Pick<IDealRepository, 'findById' | 'findActiveByProspectId' | 'save' | 'update' | 'findAll' | 'findStaleDeals' | 'findByProspectId' | 'findByStage'>>;
  let mockQuoteRepository: jest.Mocked<Pick<IQuoteRepository, 'findById' | 'findByDealId' | 'findActiveByDealId' | 'expirePreviousQuotes' | 'save' | 'update'>>;
  let mockQuoteGeneratorService: { generateQuote: jest.Mock; handleTrackingPixel: jest.Mock };
  let mockDealFollowUpService: { scheduleFollowUps: jest.Mock };
  let mockYousignService: { createSignatureProcess: jest.Mock; handleWebhook: jest.Mock };
  let mockPrisma: any;
  let mockEventEmitter: { emit: jest.Mock };
  let mockAgentEventLogger: { log: jest.Mock };
  let mockCsmQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockDealRepository = {
      findById: jest.fn(),
      findActiveByProspectId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      findStaleDeals: jest.fn(),
      findByProspectId: jest.fn(),
      findByStage: jest.fn(),
    };
    mockQuoteRepository = {
      findById: jest.fn(),
      findByDealId: jest.fn(),
      findActiveByDealId: jest.fn(),
      expirePreviousQuotes: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    mockQuoteGeneratorService = { generateQuote: jest.fn(), handleTrackingPixel: jest.fn() };
    mockDealFollowUpService = { scheduleFollowUps: jest.fn() };
    mockYousignService = { createSignatureProcess: jest.fn(), handleWebhook: jest.fn() };
    mockPrisma = { prospect: { findUnique: jest.fn() }, dealCrm: { updateMany: jest.fn() } } as any;
    mockEventEmitter = { emit: jest.fn() };
    mockAgentEventLogger = { log: jest.fn().mockResolvedValue(undefined) };
    mockCsmQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealmakerService,
        { provide: IDealRepository, useValue: mockDealRepository },
        { provide: IQuoteRepository, useValue: mockQuoteRepository },
        { provide: QuoteGeneratorService, useValue: mockQuoteGeneratorService },
        { provide: DealFollowUpService, useValue: mockDealFollowUpService },
        { provide: YousignService, useValue: mockYousignService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentEventLoggerService, useValue: mockAgentEventLogger },
        { provide: getQueueToken(QUEUE_NAMES.CSM_ONBOARDING), useValue: mockCsmQueue },
      ],
    }).compile();

    service = module.get<DealmakerService>(DealmakerService);
  });

  describe('createDeal()', () => {
    it('throws NotFoundException when prospect does not exist', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(null);
      await expect(
        service.createDeal({ prospectId: 'p-001', title: 'Test' }, 'user-001'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when active deal already exists for prospect', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue({ id: 'p-001' });
      const existingDeal = Deal.create({ prospectId: 'p-001', title: 'Existing' });
      mockDealRepository.findActiveByProspectId.mockResolvedValue([existingDeal]);

      await expect(
        service.createDeal({ prospectId: 'p-001', title: 'New Deal' }, 'user-001'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates deal, emits event, and logs when inputs are valid', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue({ id: 'p-001' });
      mockDealRepository.findActiveByProspectId.mockResolvedValue([]);
      const savedDeal = Deal.create({ prospectId: 'p-001', title: 'New Deal' });
      mockDealRepository.save.mockResolvedValue(savedDeal);

      const result = await service.createDeal({ prospectId: 'p-001', title: 'New Deal' }, 'user-001');

      expect(result).toBe(savedDeal);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'deal.created',
        expect.objectContaining({ prospectId: 'p-001', userId: 'user-001' }),
      );
      expect(mockAgentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'dealmaker', eventType: 'deal_created' }),
      );
    });
  });

  describe('advanceStage()', () => {
    it('throws NotFoundException when deal not found', async () => {
      mockDealRepository.findById.mockResolvedValue(null);
      await expect(
        service.advanceStage('d-001', DealStage.DEVIS_CREE, undefined, 'user-001'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when closing to GAGNE without a reason', async () => {
      const deal = Deal.create({ prospectId: 'p-001', title: 'Test' })
        .advanceStage(DealStage.DEVIS_CREE)
        .advanceStage(DealStage.DEVIS_EN_CONSIDERATION)
        .advanceStage(DealStage.NEGOCIATION)
        .advanceStage(DealStage.SIGNATURE_EN_COURS);
      mockDealRepository.findById.mockResolvedValue(deal);

      await expect(
        service.advanceStage(deal.id, DealStage.GAGNE, undefined, 'user-001'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('uses close() for GAGNE and dispatches to CSM queue', async () => {
      const deal = Deal.create({ prospectId: 'p-001', title: 'Test' })
        .advanceStage(DealStage.DEVIS_CREE)
        .advanceStage(DealStage.DEVIS_EN_CONSIDERATION)
        .advanceStage(DealStage.NEGOCIATION)
        .advanceStage(DealStage.SIGNATURE_EN_COURS);

      const closedDeal = deal.close(true, 'Won it');
      mockDealRepository.findById.mockResolvedValueOnce(deal);
      mockPrisma.dealCrm.updateMany.mockResolvedValue({ count: 1 });
      mockDealRepository.findById.mockResolvedValueOnce(closedDeal);
      mockPrisma.prospect.findUnique.mockResolvedValue({ companyName: 'ACME' });

      const result = await service.advanceStage(deal.id, DealStage.GAGNE, 'Won it', 'user-001');

      expect(result.stage).toBe(DealStage.GAGNE);
      expect(mockCsmQueue.add).toHaveBeenCalledWith(
        'onboard-customer',
        expect.objectContaining({ dealId: closedDeal.id }),
      );
    });

    it('emits stage_changed event with userId', async () => {
      const deal = Deal.create({ prospectId: 'p-001', title: 'Test' });
      const advanced = deal.advanceStage(DealStage.DEVIS_CREE);
      mockDealRepository.findById.mockResolvedValueOnce(deal);
      mockPrisma.dealCrm.updateMany.mockResolvedValue({ count: 1 });
      mockDealRepository.findById.mockResolvedValueOnce(advanced);

      await service.advanceStage(deal.id, DealStage.DEVIS_CREE, undefined, 'user-001');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'deal.stage_changed',
        expect.objectContaining({ userId: 'user-001', newStage: DealStage.DEVIS_CREE }),
      );
    });
  });

  describe('startSignatureProcess()', () => {
    it('throws NotFoundException when deal not found', async () => {
      mockDealRepository.findById.mockResolvedValue(null);
      await expect(service.startSignatureProcess('d-001')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when no active quote exists', async () => {
      const deal = Deal.create({ prospectId: 'p-001', title: 'Test' });
      mockDealRepository.findById.mockResolvedValue(deal);
      mockQuoteRepository.findActiveByDealId.mockResolvedValue([]);

      await expect(service.startSignatureProcess(deal.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('delegates to YousignService when deal and quote exist', async () => {
      const deal = Deal.create({ prospectId: 'p-001', title: 'Test' });
      const quote = Quote.reconstitute({
        id: 'q-001',
        dealId: deal.id,
        prospectId: 'p-001',
        quoteNumber: 'QT-001',
        title: 'Test',
        amountHtEur: 5000,
        tvaRate: 0.2,
        lineItems: [{ description: 'Service', quantity: 1, unitPriceEur: 5000 }],
        status: 'sent',
        createdAt: new Date(),
      });
      mockDealRepository.findById.mockResolvedValue(deal);
      mockQuoteRepository.findActiveByDealId.mockResolvedValue([quote]);
      mockYousignService.createSignatureProcess.mockResolvedValue(undefined);

      await service.startSignatureProcess(deal.id);

      expect(mockYousignService.createSignatureProcess).toHaveBeenCalledWith(deal, quote);
    });
  });
});
