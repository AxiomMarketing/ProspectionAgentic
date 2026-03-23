import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AnalyzePipelineCommand } from '../commands/analyze-pipeline.command';
import { GetPipelineMetricsQuery } from '../queries/get-pipeline-metrics.query';

@Injectable()
export class AnalysteService {
  private readonly logger = new Logger(AnalysteService.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async getDashboardSummary(): Promise<any> {
    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30);

    this.logger.log({ msg: 'Getting dashboard summary', dateFrom, dateTo });

    return this.queryBus.execute(new GetPipelineMetricsQuery(dateFrom, dateTo));
  }

  async triggerDailyAnalysis(): Promise<void> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    this.logger.log({ msg: 'Triggering daily analysis', date: today.toISOString().split('T')[0] });

    await this.commandBus.execute(new AnalyzePipelineCommand(startOfDay, endOfDay));
  }
}
