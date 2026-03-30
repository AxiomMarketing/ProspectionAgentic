import { PipelineMetric } from '../entities/pipeline-metric.entity';
import { DailySnapshot } from '../entities/pipeline-metric.entity';

export abstract class IPipelineMetricRepository {
  abstract findByDateRange(from: Date, to: Date, take?: number, skip?: number): Promise<PipelineMetric[]>;
  abstract findByMetricName(metricName: string): Promise<PipelineMetric[]>;
  abstract save(metric: PipelineMetric): Promise<PipelineMetric>;
  abstract aggregateByPeriod(
    metricName: string,
    dateFrom: Date,
    dateTo: Date,
    period?: 'day' | 'week' | 'month',
  ): Promise<unknown[]>;
  abstract findLatestSnapshot(): Promise<DailySnapshot | null>;
  abstract upsertSnapshot(date: Date, data: Partial<DailySnapshot>): Promise<DailySnapshot>;
}
