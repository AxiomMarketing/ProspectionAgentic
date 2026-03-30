import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { MetricsCollectorService } from './metrics-collector.service';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { ReportGeneratorService } from './report-generator.service';
import { RecommenderService } from './recommender.service';

export interface MetricsSummaryResponse {
  period: { from: Date; to: Date };
  kpis: {
    totalLeadsGeneres: number;
    suiveurReplyRate: number;
    suiveurBounceRate: number;
    pipelineRdvBookes: number;
    pipelineDealsGagnes: number;
    pipelineRevenuJour: number;
    coutTotalJourEur: number;
  };
  trends: {
    date: Date;
    leads: number;
    replyRate: number;
    rdvBookes: number;
    revenu: number;
  }[];
  alertCount: number;
  pendingRecommendations: number;
}

export interface AlertResponse {
  id: string;
  severity: string;
  title: string;
  description: string | null;
  category: string | null;
  metricName: string | null;
  metricValue: number | null;
  isResolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface RecommendationResponse {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: number;
  targetType: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AnalysteService {
  private readonly logger = new Logger(AnalysteService.name);

  constructor(
    private readonly metricsCollector: MetricsCollectorService,
    private readonly anomalyDetector: AnomalyDetectorService,
    private readonly reportGenerator: ReportGeneratorService,
    private readonly recommender: RecommenderService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getDashboardSummary(dateFrom: Date, dateTo: Date): Promise<MetricsSummaryResponse> {
    this.logger.log({ msg: 'Getting dashboard summary', dateFrom, dateTo });

    const [snapshots, alertCount, pendingRecommendations] = await Promise.all([
      this.prisma.metriquesDaily.findMany({
        where: { dateSnapshot: { gte: dateFrom, lte: dateTo } },
        orderBy: { dateSnapshot: 'asc' },
        take: 100,
      }),
      this.prisma.alertes.count({ where: { isResolved: false } }),
      this.prisma.recommandations.count({ where: { status: 'pending' } }),
    ]);

    const latest = snapshots[snapshots.length - 1];

    const kpis = {
      totalLeadsGeneres: latest?.pipelineLeadsGeneres ?? 0,
      suiveurReplyRate: latest?.suiveurReplyRate ?? 0,
      suiveurBounceRate: latest?.suiveurBounceRate ?? 0,
      pipelineRdvBookes: latest?.pipelineRdvBookes ?? 0,
      pipelineDealsGagnes: latest?.pipelineDealsGagnes ?? 0,
      pipelineRevenuJour: latest?.pipelineRevenuJour ?? 0,
      coutTotalJourEur: latest?.coutTotalJourEur ?? 0,
    };

    const trends = snapshots.map((s) => ({
      date: s.dateSnapshot,
      leads: s.pipelineLeadsGeneres,
      replyRate: s.suiveurReplyRate,
      rdvBookes: s.pipelineRdvBookes,
      revenu: s.pipelineRevenuJour,
    }));

    return { period: { from: dateFrom, to: dateTo }, kpis, trends, alertCount, pendingRecommendations };
  }

  async triggerDailyAnalysis(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    this.logger.log({ msg: 'Triggering daily analysis', date: today });
    await this.metricsCollector.collectDailySnapshot(today);
  }

  async triggerWeeklyReport(): Promise<void> {
    this.logger.log({ msg: 'Triggering weekly report' });
    await this.reportGenerator.generateWeeklyReport();
  }

  async triggerMonthlyReport(): Promise<void> {
    this.logger.log({ msg: 'Triggering monthly report' });
    await this.reportGenerator.generateMonthlyReport();
  }

  async getAlerts(resolved?: boolean): Promise<AlertResponse[]> {
    const where = resolved !== undefined ? { isResolved: resolved } : {};
    const records = await this.prisma.alertes.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return records.map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      description: r.description,
      category: r.category,
      metricName: r.metricName,
      metricValue: r.metricValue,
      isResolved: r.isResolved,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    }));
  }

  async getRecommendations(status?: string): Promise<RecommendationResponse[]> {
    const where = status ? { status } : {};
    const records = await this.prisma.recommandations.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return records.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      priority: r.priority,
      targetType: r.targetType,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async acknowledgeAlert(id: string, userId: string): Promise<AlertResponse> {
    const existing = await this.prisma.alertes.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Alert ${id} not found`);
    }

    const updated = await this.prisma.alertes.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
      },
    });

    this.logger.log({ msg: 'Alert acknowledged', alertId: id, userId });

    return {
      id: updated.id,
      severity: updated.severity,
      title: updated.title,
      description: updated.description,
      category: updated.category,
      metricName: updated.metricName,
      metricValue: updated.metricValue,
      isResolved: updated.isResolved,
      resolvedAt: updated.resolvedAt,
      createdAt: updated.createdAt,
    };
  }

  async approveRecommendation(id: string, userId: string): Promise<RecommendationResponse> {
    const existing = await this.prisma.recommandations.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Recommendation ${id} not found`);
    }

    const updated = await this.prisma.recommandations.update({
      where: { id },
      data: {
        status: 'approved',
        appliedAt: new Date(),
        appliedBy: userId,
      },
    });

    this.logger.log({ msg: 'Recommendation approved', recId: id, userId });

    return {
      id: updated.id,
      type: updated.type,
      title: updated.title,
      description: updated.description,
      priority: updated.priority,
      targetType: updated.targetType,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async rejectRecommendation(id: string, userId: string): Promise<RecommendationResponse> {
    const existing = await this.prisma.recommandations.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Recommendation ${id} not found`);
    }

    const updated = await this.prisma.recommandations.update({
      where: { id },
      data: {
        status: 'dismissed',
        dismissedAt: new Date(),
      },
    });

    this.logger.log({ msg: 'Recommendation rejected', recId: id, userId });

    return {
      id: updated.id,
      type: updated.type,
      title: updated.title,
      description: updated.description,
      priority: updated.priority,
      targetType: updated.targetType,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
