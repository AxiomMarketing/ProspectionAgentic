import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { AnalysteService } from './application/services/analyste.service';
import { MetricsCollectorService } from './application/services/metrics-collector.service';
import { AnomalyDetectorService } from './application/services/anomaly-detector.service';
import { ReportGeneratorService } from './application/services/report-generator.service';
import { RecommenderService } from './application/services/recommender.service';
import { AnalysteController } from './presentation/controllers/analyste.controller';
import { AnalyzePipelineHandler } from './application/commands/analyze-pipeline.handler';
import { GetPipelineMetricsHandler } from './application/queries/get-pipeline-metrics.handler';
import { IPipelineMetricRepository } from './domain/repositories/i-pipeline-metric.repository';
import { PrismaPipelineMetricRepository } from './infrastructure/repositories/prisma-pipeline-metric.repository';
import { LlmModule } from '@modules/llm/llm.module';
import { EmailModule } from '@modules/email/email.module';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), HttpModule, LlmModule, EmailModule],
  controllers: [AnalysteController],
  providers: [
    AnalysteService,
    MetricsCollectorService,
    AnomalyDetectorService,
    ReportGeneratorService,
    RecommenderService,
    AnalyzePipelineHandler,
    GetPipelineMetricsHandler,
    { provide: IPipelineMetricRepository, useClass: PrismaPipelineMetricRepository },
  ],
  exports: [AnalysteService],
})
export class AgentAnalysteModule {}
