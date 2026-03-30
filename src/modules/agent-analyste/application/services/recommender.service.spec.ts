import { Test, TestingModule } from '@nestjs/testing';
import { RecommenderService } from './recommender.service';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { LlmService } from '@modules/llm/llm.service';

describe('RecommenderService', () => {
  let service: RecommenderService;
  const mockFindMany = jest.fn();
  const mockCount = jest.fn();
  const mockGroupBy = jest.fn();
  const mockCreate = jest.fn();
  const mockLlmCall = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommenderService,
        {
          provide: PrismaService,
          useValue: {
            messageTemplate: { findMany: mockFindMany, count: mockCount },
            prospectScore: { findMany: mockFindMany, count: mockCount },
            dealCrm: { count: mockCount },
            rawLead: { groupBy: mockGroupBy, findMany: mockFindMany },
            prospectSequence: { findMany: mockFindMany },
            nurtureProspect: { groupBy: mockGroupBy, count: mockCount },
            recommandations: { create: mockCreate },
            abTest: { findMany: mockFindMany, update: jest.fn() },
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: HttpService, useValue: { post: jest.fn() } },
        { provide: LlmService, useValue: { call: mockLlmCall } },
      ],
    }).compile();

    service = module.get<RecommenderService>(RecommenderService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('calculateABTestSignificance', () => {
    it('returns significant=false when sample < minSample', () => {
      const result = service.calculateABTestSignificance(100, 5, 100, 6);
      expect(result.significant).toBe(false);
      expect(result.reason).toBe('insufficient_sample');
    });

    it('returns TIE when both variants have 0 replies', () => {
      const result = service.calculateABTestSignificance(300, 0, 300, 0);
      expect(result.significant).toBe(false);
      expect(result.gagnant).toBe('TIE');
      expect(result.reason).toBe('no_replies');
    });

    it('returns significant=true for clearly different rates', () => {
      // A: 300 envois, 5% reply = 15 replies
      // B: 300 envois, 20% reply = 60 replies
      const result = service.calculateABTestSignificance(300, 15, 300, 60);
      expect(result.significant).toBe(true);
      expect(result.gagnant).toBe('B');
      expect(result.pValue).toBeDefined();
      expect(result.pValue!).toBeLessThan(0.05);
    });

    it('returns TIE when rates are equal with sufficient sample', () => {
      const result = service.calculateABTestSignificance(500, 25, 500, 25);
      expect(result.gagnant).toBe('TIE');
    });

    it('handles both-0-replies edge case', () => {
      const result = service.calculateABTestSignificance(500, 0, 500, 0);
      expect(result.gagnant).toBe('TIE');
      expect(result.reason).toBe('no_replies');
    });
  });

  describe('analyzeTemplatePerformance', () => {
    it('flags template with reply rate below 3% after 50+ sends', async () => {
      mockFindMany.mockResolvedValue([
        { id: 't1', name: 'Template Cold', totalSent: 100, totalReplied: 2 },
      ]);

      const recs = await service.analyzeTemplatePerformance();

      expect(recs).toHaveLength(1);
      expect(recs[0].type).toBe('desactiver_template');
      expect(recs[0].title).toContain('Template Cold');
    });

    it('ignores templates with fewer than 50 sends', async () => {
      mockFindMany.mockResolvedValue([
        { id: 't1', name: 'New Template', totalSent: 30, totalReplied: 0 },
      ]);

      const recs = await service.analyzeTemplatePerformance();

      expect(recs).toHaveLength(0);
    });

    it('does not flag template with reply rate above 3%', async () => {
      mockFindMany.mockResolvedValue([
        { id: 't1', name: 'Good Template', totalSent: 100, totalReplied: 5 },
      ]);

      const recs = await service.analyzeTemplatePerformance();

      expect(recs).toHaveLength(0);
    });
  });
});
