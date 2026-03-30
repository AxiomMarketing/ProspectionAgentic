import { Test, TestingModule } from '@nestjs/testing';
import { ReportGeneratorService } from './report-generator.service';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { LlmService } from '@modules/llm/llm.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';

describe('ReportGeneratorService', () => {
  let service: ReportGeneratorService;
  const mockFindFirst = jest.fn();
  const mockFindMany = jest.fn();
  const mockAggregate = jest.fn();
  const mockLlmCall = jest.fn();
  const mockHttpPost = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportGeneratorService,
        {
          provide: PrismaService,
          useValue: {
            metriquesDaily: { findFirst: mockFindFirst, findMany: mockFindMany },
            prospectScore: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: LlmService, useValue: { call: mockLlmCall } },
        { provide: IEmailAdapter, useValue: { sendEmail: jest.fn() } },
        {
          provide: HttpService,
          useValue: { post: mockHttpPost },
        },
      ],
    }).compile();

    service = module.get<ReportGeneratorService>(ReportGeneratorService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getHealthStatus', () => {
    it('returns VERT when replyRate >= 0.05 and bounceRate < 0.02', () => {
      expect(service.getHealthStatus(0.06, 0.01)).toBe('VERT');
    });

    it('returns JAUNE when replyRate >= 0.03 but bounceRate < 0.03', () => {
      expect(service.getHealthStatus(0.04, 0.025)).toBe('JAUNE');
    });

    it('returns ROUGE when replyRate is below thresholds', () => {
      expect(service.getHealthStatus(0.01, 0.04)).toBe('ROUGE');
    });

    it('returns ROUGE when bounceRate >= 0.03 even with moderate reply rate', () => {
      expect(service.getHealthStatus(0.04, 0.04)).toBe('ROUGE');
    });
  });

  describe('calculateDelta', () => {
    it('returns "=" for equal values', () => {
      expect(service.calculateDelta(10, 10)).toBe('=');
    });

    it('returns "=" for both zero', () => {
      expect(service.calculateDelta(0, 0)).toBe('=');
    });

    it('returns positive delta string for improvement', () => {
      const result = service.calculateDelta(12, 10);
      expect(result).toContain('+2');
      expect(result).toContain('+20%');
    });

    it('returns negative delta string for regression', () => {
      const result = service.calculateDelta(8, 10);
      expect(result).toContain('-2');
      expect(result).toContain('-20%');
    });

    it('handles yesterday=0 by returning "+X (nouveau)"', () => {
      const result = service.calculateDelta(5, 0);
      expect(result).toContain('nouveau');
    });
  });

  describe('generateWeeklyReport — Claude fallback on timeout', () => {
    it('uses fallback message when LLM throws', async () => {
      mockFindMany.mockResolvedValue([]);
      mockLlmCall.mockRejectedValue(new Error('Request timeout'));

      // Should not throw
      await expect(service.generateWeeklyReport()).resolves.not.toThrow();
    });

    it('proceeds even when Slack webhook is not configured', async () => {
      mockFindMany.mockResolvedValue([]);
      mockLlmCall.mockResolvedValue({ content: 'Good week.' });

      await expect(service.generateWeeklyReport()).resolves.not.toThrow();
    });
  });
});
