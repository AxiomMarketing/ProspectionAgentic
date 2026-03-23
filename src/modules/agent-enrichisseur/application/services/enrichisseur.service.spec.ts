import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EnrichisseurService } from './enrichisseur.service';
import { EmailPatternService } from './email-pattern.service';
import { PrismaService } from '@core/database/prisma.service';
import { BlacklistedContactException } from '@common/exceptions/blacklisted-contact.exception';
import { ProspectNotFoundException } from '@common/exceptions/prospect-not-found.exception';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const mockProspect = {
  id: 'prospect-1',
  email: 'contact@acme.com',
  firstName: 'Jean',
  lastName: 'Dupont',
  companyName: 'Acme',
  companyWebsite: 'https://www.acme.com',
  companySiren: '123456789',
  companySize: '11-50',
  status: 'new',
  enrichedAt: null,
};

const mockPrisma = {
  prospect: {
    findUnique: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn(),
  },
  rgpdBlacklist: { findFirst: jest.fn() },
  prospectScore: { count: jest.fn() },
  emailSend: { count: jest.fn() },
  agentEvent: { count: jest.fn() },
  dealCrm: { count: jest.fn() },
  nurtureProspect: { findMany: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  customer: { findMany: jest.fn() },
  metriquesDaily: { findMany: jest.fn(), createMany: jest.fn() },
};

const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

const mockEventEmitter = { emit: jest.fn() };

describe('EnrichisseurService', () => {
  let service: EnrichisseurService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrichisseurService,
        EmailPatternService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(QUEUE_NAMES.SCOREUR_PIPELINE), useValue: mockQueue },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<EnrichisseurService>(EnrichisseurService);
  });

  describe('enrichProspect', () => {
    it('should throw ProspectNotFoundException when prospect does not exist', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(null);

      await expect(service.enrichProspect({ prospectId: 'unknown' })).rejects.toThrow(
        ProspectNotFoundException,
      );
    });

    it('should check RGPD blacklist before enriching', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue(null);
      mockPrisma.prospect.update.mockResolvedValue({ ...mockProspect, status: 'enriched' });

      await service.enrichProspect({ prospectId: mockProspect.id });

      expect(mockPrisma.rgpdBlacklist.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw BlacklistedContactException when prospect is on RGPD blacklist', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue({
        id: 'bl-1',
        email: mockProspect.email,
      });

      await expect(service.enrichProspect({ prospectId: mockProspect.id })).rejects.toThrow(
        BlacklistedContactException,
      );
    });

    it('should dispatch job to scoreur queue after successful enrichment', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue(null);
      mockPrisma.prospect.update.mockResolvedValue({ ...mockProspect, status: 'enriched' });

      await service.enrichProspect({ prospectId: mockProspect.id });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'score-prospect',
        expect.objectContaining({ prospectId: mockProspect.id }),
        expect.any(Object),
      );
    });

    it('should emit prospect.enriched event after successful enrichment', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue(null);
      mockPrisma.prospect.update.mockResolvedValue({ ...mockProspect, status: 'enriched' });

      await service.enrichProspect({ prospectId: mockProspect.id });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'prospect.enriched',
        expect.objectContaining({ prospectId: mockProspect.id }),
      );
    });
  });

  describe('getEnrichmentStatus', () => {
    it('should return status and enrichedAt for existing prospect', async () => {
      const enrichedAt = new Date('2026-01-01');
      mockPrisma.prospect.findUnique.mockResolvedValue({ status: 'enriched', enrichedAt });

      const result = await service.getEnrichmentStatus(mockProspect.id);

      expect(result.status).toBe('enriched');
      expect(result.enrichedAt).toEqual(enrichedAt);
    });

    it('should throw ProspectNotFoundException when prospect is not found', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(null);

      await expect(service.getEnrichmentStatus('ghost-id')).rejects.toThrow(
        ProspectNotFoundException,
      );
    });
  });
});
