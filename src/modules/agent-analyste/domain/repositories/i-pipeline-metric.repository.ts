import { PipelineMetric } from '../entities/pipeline-metric.entity';

export abstract class IPipelineMetricRepository {
  abstract findByDateRange(from: Date, to: Date): Promise<PipelineMetric[]>;
  abstract findByMetricName(metricName: string): Promise<PipelineMetric[]>;
  abstract save(metric: PipelineMetric): Promise<PipelineMetric>;
  abstract aggregateByPeriod(
    metricName: string,
    from: Date,
    to: Date,
  ): Promise<{ period: string; total: number }[]>;
}
