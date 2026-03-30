import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalysteService, MetricsSummaryResponse } from './analyste.service';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MetricsCollectorService } from './metrics-collector.service';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { ReportGeneratorService } from './report-generator.service';
import { RecommenderService } from './recommender.service';

describe('AnalysteService', () => {
  let service: AnalysteService;
  const mockFindMany = jest.fn();
  const mockCount = jest.fn();
  const mockFindUnique = jest.fn();
  const mockUpdate = jest.fn();
  const mockCollectDailySnapshot = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysteService,
        {
          provide: PrismaService,
          useValue: {
            metriquesDaily: { findMany: mockFindMany },
            alertes: { count: mockCount, findMany: mockFindMany, findUnique: mockFindUnique, update: mockUpdate },
            recommandations: { count: mockCount, findMany: mockFindMany, findUnique: mockFindUnique, update: mockUpdate },
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MetricsCollectorService, useValue: { collectDailySnapshot: mockCollectDailySnapshot } },
        { provide: AnomalyDetectorService, useValue: { detectAnomalies: jest.fn() } },
        { provide: ReportGeneratorService, useValue: { generateWeeklyReport: jest.fn(), generateMonthlyReport: jest.fn() } },
        { provide: RecommenderService, useValue: {} },
      ],
    }).compile();

    service = module.get<AnalysteService>(AnalysteService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getDashboardSummary', () => {
    it('returns typed MetricsSummaryResponse', async () => {
      const snapshot = {
        dateSnapshot: new Date('2026-01-15'),
        pipelineLeadsGeneres: 20,
        suiveurReplyRate: 0.05,
        suiveurBounceRate: 0.01,
        pipelineRdvBookes: 3,
        pipelineDealsGagnes: 1,
        pipelineRevenuJour: 500,
        coutTotalJourEur: 12,
      };
      mockFindMany.mockResolvedValue([snapshot]);
      mockCount.mockResolvedValue(2);

      const result: MetricsSummaryResponse = await service.getDashboardSummary(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.period.from).toBeInstanceOf(Date);
      expect(result.period.to).toBeInstanceOf(Date);
      expect(result.kpis.totalLeadsGeneres).toBe(20);
      expect(result.kpis.suiveurReplyRate).toBe(0.05);
      expect(result.alertCount).toBe(2);
      expect(result.pendingRecommendations).toBe(2);
      expect(result.trends).toHaveLength(1);
      expect(result.trends[0].leads).toBe(20);
    });

    it('returns zeros when no snapshots found', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const result = await service.getDashboardSummary(new Date(), new Date());

      expect(result.kpis.totalLeadsGeneres).toBe(0);
      expect(result.trends).toHaveLength(0);
    });
  });

  describe('acknowledgeAlert', () => {
    it('marks alert as resolved', async () => {
      const alert = { id: 'a1', severity: 'warning', title: 'Test', description: null, category: null, metricName: null, metricValue: null, isResolved: false, resolvedAt: null, createdAt: new Date() };
      mockFindUnique.mockResolvedValue(alert);
      mockUpdate.mockResolvedValue({ ...alert, isResolved: true, resolvedAt: new Date(), resolvedBy: 'user-1' });

      const result = await service.acknowledgeAlert('a1', 'user-1');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: expect.objectContaining({ isResolved: true, resolvedBy: 'user-1' }),
      });
      expect(result.isResolved).toBe(true);
    });

    it('throws NotFoundException when alert not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.acknowledgeAlert('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('approveRecommendation', () => {
    it('sets status to approved', async () => {
      const rec = { id: 'r1', type: 'desactiver_template', title: 'Fix', description: 'desc', priority: 2, targetType: null, status: 'pending', createdAt: new Date(), updatedAt: new Date() };
      mockFindUnique.mockResolvedValue(rec);
      mockUpdate.mockResolvedValue({ ...rec, status: 'approved', appliedAt: new Date(), appliedBy: 'user-1' });

      const result = await service.approveRecommendation('r1', 'user-1');

      expect(result.status).toBe('approved');
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({ status: 'approved', appliedBy: 'user-1' }),
      });
    });

    it('throws NotFoundException when recommendation not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.approveRecommendation('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
