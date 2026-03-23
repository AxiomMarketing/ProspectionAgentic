import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AnalyzePipelineCommand } from './analyze-pipeline.command';
import { PrismaService } from '@core/database/prisma.service';

@CommandHandler(AnalyzePipelineCommand)
export class AnalyzePipelineHandler implements ICommandHandler<AnalyzePipelineCommand> {
  private readonly logger = new Logger(AnalyzePipelineHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(command: AnalyzePipelineCommand): Promise<void> {
    const { dateFrom, dateTo } = command;

    this.logger.log({ msg: 'Analyzing pipeline', dateFrom, dateTo });

    const [prospectsByStatus, scoreDistribution, emailMetrics, agentEvents] = await Promise.all([
      this.prisma.prospect.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { createdAt: { gte: dateFrom, lte: dateTo } },
      }),
      this.prisma.prospectScore.groupBy({
        by: ['segment'],
        _avg: { totalScore: true },
        _count: { _all: true },
        where: { isLatest: true, calculatedAt: { gte: dateFrom, lte: dateTo } },
      }),
      this.prisma.emailSend.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { createdAt: { gte: dateFrom, lte: dateTo } },
      }),
      this.prisma.agentEvent.groupBy({
        by: ['agentName'],
        _count: { _all: true },
        _avg: { durationMs: true },
        where: { createdAt: { gte: dateFrom, lte: dateTo } },
      }),
    ]);

    const today = new Date().toISOString().split('T')[0];

    await this.prisma.metriquesDaily.createMany({
      data: [
        {
          date: new Date(today),
          metricName: 'prospects_by_status',
          metricValue: prospectsByStatus.length,
          dimensions: prospectsByStatus as any,
        },
        {
          date: new Date(today),
          metricName: 'score_distribution',
          metricValue: scoreDistribution.length,
          dimensions: scoreDistribution as any,
        },
        {
          date: new Date(today),
          metricName: 'email_metrics',
          metricValue: emailMetrics.length,
          dimensions: emailMetrics as any,
        },
        {
          date: new Date(today),
          metricName: 'agent_performance',
          metricValue: agentEvents.length,
          dimensions: agentEvents as any,
        },
      ],
      skipDuplicates: true,
    });

    this.logger.log({ msg: 'Pipeline analysis complete', date: today });
  }
}
