import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AnalyzePipelineCommand } from './analyze-pipeline.command';
import { MetricsCollectorService } from '../services/metrics-collector.service';

@CommandHandler(AnalyzePipelineCommand)
export class AnalyzePipelineHandler implements ICommandHandler<AnalyzePipelineCommand> {
  private readonly logger = new Logger(AnalyzePipelineHandler.name);

  constructor(private readonly metricsCollector: MetricsCollectorService) {}

  async execute(command: AnalyzePipelineCommand): Promise<void> {
    const { dateFrom } = command;
    const snapshotDate = dateFrom.toISOString().split('T')[0];

    this.logger.log({ msg: 'Analyzing pipeline via MetricsCollector', date: snapshotDate });

    await this.metricsCollector.collectDailySnapshot(snapshotDate);

    this.logger.log({ msg: 'Pipeline analysis complete', date: snapshotDate });
  }
}
