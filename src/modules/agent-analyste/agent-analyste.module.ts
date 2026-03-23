import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AnalysteService } from './application/services/analyste.service';
import { AnalysteController } from './presentation/controllers/analyste.controller';
import { AnalyzePipelineHandler } from './application/commands/analyze-pipeline.handler';
import { GetPipelineMetricsHandler } from './application/queries/get-pipeline-metrics.handler';
import { IPipelineMetricRepository } from './domain/repositories/i-pipeline-metric.repository';
import { PrismaPipelineMetricRepository } from './infrastructure/repositories/prisma-pipeline-metric.repository';

@Module({
  imports: [CqrsModule],
  controllers: [AnalysteController],
  providers: [
    AnalysteService,
    AnalyzePipelineHandler,
    GetPipelineMetricsHandler,
    { provide: IPipelineMetricRepository, useClass: PrismaPipelineMetricRepository },
  ],
  exports: [AnalysteService],
})
export class AgentAnalysteModule {}
