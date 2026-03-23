import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetPipelineMetricsQuery } from './get-pipeline-metrics.query';
import { PrismaService } from '@core/database/prisma.service';

@QueryHandler(GetPipelineMetricsQuery)
export class GetPipelineMetricsHandler implements IQueryHandler<GetPipelineMetricsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetPipelineMetricsQuery): Promise<any> {
    const { dateFrom, dateTo, metricNames } = query;
    const where: any = { date: { gte: dateFrom, lte: dateTo } };
    if (metricNames && metricNames.length > 0) {
      where.metricName = { in: metricNames };
    }

    const metrics = await this.prisma.metriquesDaily.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const [totalProspects, hotProspects, emailsSent, dealsOpen] = await Promise.all([
      this.prisma.prospect.count(),
      this.prisma.prospectScore.count({ where: { isLatest: true, totalScore: { gte: 75 } } }),
      this.prisma.emailSend.count({ where: { sentAt: { gte: dateFrom } } }),
      this.prisma.dealCrm.count({ where: { stage: { notIn: ['closed_won', 'closed_lost'] } } }),
    ]);

    return {
      historical: metrics,
      realtime: { totalProspects, hotProspects, emailsSent, dealsOpen },
    };
  }
}
