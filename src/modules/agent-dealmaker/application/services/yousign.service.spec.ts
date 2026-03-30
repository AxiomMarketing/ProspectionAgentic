import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { of } from 'rxjs';
import { YousignService } from './yousign.service';
import { PrismaService } from '@core/database/prisma.service';
import { DealStage } from '../../domain/entities/deal.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { Deal } from '../../domain/entities/deal.entity';
import { Quote } from '../../domain/entities/quote.entity';

const createMockPrisma = () => ({
  prospect: { findUnique: jest.fn() },
  webhookEvent: { findFirst: jest.fn(), create: jest.fn() },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
});

function makeDeal(): Deal {
  return Deal.reconstitute({
    id: 'deal-001',
    prospectId: 'prospect-001',
    title: 'Test Contract',
    stage: DealStage.SIGNATURE_EN_COURS,
    stageHistory: [{ stage: DealStage.QUALIFICATION, enteredAt: new Date() }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeQuote(): Quote {
  return Quote.reconstitute({
    id: 'quote-001',
    dealId: 'deal-001',
    prospectId: 'prospect-001',
    quoteNumber: 'QT-001',
    title: 'Test Quote',
    amountHtEur: 5000,
    tvaRate: 0.2,
    lineItems: [{ description: 'Service', quantity: 1, unitPriceEur: 5000 }],
    status: 'accepted',
    createdAt: new Date(),
  });
}

describe('YousignService', () => {
  let service: YousignService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockHttpService: { post: jest.Mock; get: jest.Mock; delete: jest.Mock };
  let mockCsmQueue: { add: jest.Mock };
  let mockDealmakerQueue: { add: jest.Mock };
  let mockEventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockHttpService = { post: jest.fn(), get: jest.fn(), delete: jest.fn() };
    mockCsmQueue = { add: jest.fn() };
    mockDealmakerQueue = { add: jest.fn() };
    mockEventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YousignService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              if (key === 'YOUSIGN_API_KEY') return 'test-api-key';
              if (key === 'NODE_ENV') return 'test';
              return defaultVal ?? '';
            }),
          },
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: getQueueToken(QUEUE_NAMES.CSM_ONBOARDING), useValue: mockCsmQueue },
        { provide: getQueueToken(QUEUE_NAMES.DEALMAKER_PIPELINE), useValue: mockDealmakerQueue },
      ],
    }).compile();

    service = module.get<YousignService>(YousignService);
  });

  describe('createSignatureProcess()', () => {
    it('calls Yousign API in sequence: create → upload → signer → fields → activate', async () => {
      const signatureRequest = {
        id: 'sig-req-001',
        status: 'draft',
        name: 'Test',
        delivery_mode: 'email',
        expiration_date: '',
      };
      const document = { id: 'doc-001', nature: 'signable_document', filename: 'contract.pdf' };
      const signer = {
        id: 'signer-001',
        status: 'pending',
        info: { first_name: 'Jean', last_name: 'Test', email: 'jean@test.fr' },
      };

      mockHttpService.post
        .mockReturnValueOnce(of({ data: signatureRequest }))
        .mockReturnValueOnce(of({ data: document }))
        .mockReturnValueOnce(of({ data: signer }))
        .mockReturnValueOnce(of({ data: {} }))
        .mockReturnValueOnce(of({ data: {} }))
        .mockReturnValueOnce(of({ data: {} }));

      mockPrisma.prospect.findUnique.mockResolvedValue({
        firstName: 'Jean',
        lastName: 'Test',
        email: 'jean@test.fr',
      });
      mockPrisma.$executeRaw.mockResolvedValue(1);

      jest.spyOn(service, 'generateContractPdf').mockResolvedValue(Buffer.from('pdf'));
      // Spy on private uploadDocument to bypass form-data dynamic import
      jest
        .spyOn(service as unknown as { uploadDocument: (...args: unknown[]) => Promise<unknown> }, 'uploadDocument')
        .mockResolvedValue({ id: 'doc-001', nature: 'signable_document', filename: 'contract.pdf' });

      await service.createSignatureProcess(makeDeal(), makeQuote());

      // create, add signer, 2 fields, activate = 5 (upload mocked separately)
      expect(mockHttpService.post).toHaveBeenCalledTimes(5);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockDealmakerQueue.add).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleWebhook()', () => {
    it('transitions deal to GAGNE and dispatches to CSM on signature_request.done', async () => {
      const signatureRequestId = 'sig-req-001';
      mockPrisma.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'deal-001',
          prospect_id: 'prospect-001',
          amount_eur: 5000,
          yousign_request_id: signatureRequestId,
          yousign_document_id: 'doc-001',
          yousign_signer_id: 'signer-001',
        },
      ]);
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.prospect.findUnique.mockResolvedValue({ companyName: 'ACME' });
      mockPrisma.webhookEvent.create.mockResolvedValue({ id: 'webhook-event-001' });
      mockHttpService.get.mockReturnValue(of({ data: Buffer.from('signed-pdf') }));

      await service.handleWebhook('signature_request.done', {
        signature_request_id: signatureRequestId,
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockCsmQueue.add).toHaveBeenCalledWith(
        'onboard-customer',
        expect.objectContaining({ dealId: 'deal-001' }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('deal.won', expect.any(Object));
    });

    it('transitions deal back to NEGOCIATION on signature_request.expired', async () => {
      const signatureRequestId = 'sig-req-002';
      mockPrisma.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'deal-002',
          prospect_id: 'prospect-002',
          amount_eur: 3000,
          yousign_request_id: signatureRequestId,
          yousign_document_id: null,
          yousign_signer_id: null,
        },
      ]);
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.webhookEvent.create.mockResolvedValue({ id: 'webhook-event-002' });

      await service.handleWebhook('signature_request.expired', {
        signature_request_id: signatureRequestId,
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'deal.signature_expired',
        expect.objectContaining({ dealId: 'deal-002' }),
      );
    });

    it('is idempotent when no deal found for signature request', async () => {
      mockPrisma.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.webhookEvent.create.mockResolvedValue({ id: 'webhook-event-unknown' });

      await expect(
        service.handleWebhook('signature_request.done', { signature_request_id: 'unknown' }),
      ).resolves.not.toThrow();

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockCsmQueue.add).not.toHaveBeenCalled();
    });
  });
});
