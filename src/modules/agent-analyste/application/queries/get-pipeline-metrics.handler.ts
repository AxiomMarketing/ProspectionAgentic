import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetPipelineMetricsQuery } from './get-pipeline-metrics.query';
import { PrismaService } from '@core/database/prisma.service';
import { MetricsSummaryResponse } from '../services/analyste.service';

@QueryHandler(GetPipelineMetricsQuery)
export class GetPipelineMetricsHandler implements IQueryHandler<GetPipelineMetricsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetPipelineMetricsQuery): Promise<MetricsSummaryResponse> {
    const { dateFrom, dateTo } = query;

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

    return {
      period: { from: dateFrom, to: dateTo },
      kpis,
      trends,
      alertCount,
      pendingRecommendations,
    };
  }
}
