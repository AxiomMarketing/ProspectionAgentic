import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuoteGeneratorService } from './quote-generator.service';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { PricingService } from './pricing.service';

const createMockPrisma = () => ({
  quote: { findUnique: jest.fn(), create: jest.fn() },
  dealCrm: { findUnique: jest.fn(), update: jest.fn() },
  devisTracking: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  devisOpen: { create: jest.fn() },
  dealActivity: { create: jest.fn() },
});

describe('QuoteGeneratorService', () => {
  let service: QuoteGeneratorService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockLlmService: { call: jest.Mock };
  let mockEmailAdapter: { sendEmail: jest.Mock };
  let mockPricingService: { getPricingDetail: jest.Mock; generateLineItems: jest.Mock; getPrice: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  const baseDeal = {
    id: 'deal-001',
    stage: 'QUALIFICATION',
    title: 'Test deal',
    typeProjet: 'site_vitrine',
    tierRecommande: 'silver',
    rdvNotes: null,
    quoteId: null,
    devisId: null,
    prospect: {
      fullName: 'Jean Test',
      companyName: 'ACME',
      email: 'jean@acme.fr',
    },
  };

  const basePricing = {
    nom: 'Site Vitrine Silver',
    prix: 3500,
    features: ['5 pages', 'CMS'],
    timeline: 4,
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockLlmService = { call: jest.fn() };
    mockEmailAdapter = { sendEmail: jest.fn() };
    mockPricingService = { getPricingDetail: jest.fn(), generateLineItems: jest.fn(), getPrice: jest.fn() };
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'APP_BASE_URL') return 'http://localhost:3000';
        if (key === 'AXIOM_SENDER_EMAIL') return 'contact@axiom-marketing.fr';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteGeneratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LlmService, useValue: mockLlmService },
        { provide: IEmailAdapter, useValue: mockEmailAdapter },
        { provide: PricingService, useValue: mockPricingService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<QuoteGeneratorService>(QuoteGeneratorService);
  });

  describe('generateQuote()', () => {
    it('throws NotFoundException when deal not found', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue(null);
      await expect(service.generateQuote('no-deal', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when deal is already closed (GAGNE)', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue({ ...baseDeal, stage: 'GAGNE' });
      await expect(service.generateQuote('deal-001', 'p1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when active quote already exists', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue(baseDeal);
      mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'sent' });
      await expect(service.generateQuote('deal-001', 'p1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('generates quote successfully on happy path', async () => {
      mockPrisma.dealCrm.findUnique.mockResolvedValue(baseDeal);
      mockPrisma.quote.findUnique.mockResolvedValue(null);
      mockPrisma.devisTracking.create.mockResolvedValue({ id: 'track-001' });
      mockPrisma.quote.create.mockResolvedValue({ id: 'quote-001' });
      mockPrisma.devisTracking.update.mockResolvedValue({});
      mockPrisma.dealCrm.update.mockResolvedValue({});
      mockPrisma.dealActivity.create.mockResolvedValue({});

      mockLlmService.call.mockResolvedValue({
        content: JSON.stringify({
          type_projet: 'site_vitrine',
          tier_recommande: 'silver',
          budget_estime: 3500,
          complexite: 'moyenne',
          points_cles: ['Design moderne', 'Responsive'],
        }),
      });

      mockPricingService.getPricingDetail.mockReturnValue(basePricing);
      mockPricingService.generateLineItems.mockReturnValue([
        { description: 'Site Vitrine', quantity: 1, unitPriceEur: 3500 },
      ]);

      jest.spyOn(service, 'generatePdf').mockResolvedValue(Buffer.from('pdf'));

      const result = await service.generateQuote('deal-001', 'prospect-001');

      expect(result).toEqual({ quoteId: 'quote-001', trackingId: 'track-001' });
      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('falls back to default scope when LLM throws', async () => {
      mockLlmService.call.mockRejectedValue(new Error('LLM down'));
      const fallback = await service.analyzeScope('notes', 'besoins');
      expect(fallback.type_projet).toBe('site_vitrine');
      expect(fallback.tier_recommande).toBe('silver');
    });
  });

  describe('analyzeScope()', () => {
    it('returns fallback when LLM returns invalid type_projet', async () => {
      mockLlmService.call.mockResolvedValue({
        content: JSON.stringify({
          type_projet: 'malicious_payload',
          tier_recommande: 'silver',
          budget_estime: 5000,
          complexite: 'moyenne',
          points_cles: ['Point 1'],
        }),
      });
      const result = await service.analyzeScope('notes', 'besoins');
      expect(result.type_projet).toBe('site_vitrine');
    });

    it('sanitizes points_cles containing HTML characters', async () => {
      mockLlmService.call.mockResolvedValue({
        content: JSON.stringify({
          type_projet: 'site_vitrine',
          tier_recommande: 'silver',
          budget_estime: 5000,
          complexite: 'moyenne',
          points_cles: ['<script>alert(1)</script>', 'Normal point'],
        }),
      });
      const result = await service.analyzeScope('notes', 'besoins');
      expect(result.points_cles[0]).not.toContain('<');
      expect(result.points_cles[0]).not.toContain('>');
    });
  });
});
