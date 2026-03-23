import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IPipelineMetricRepository } from '../../domain/repositories/i-pipeline-metric.repository';
import { PipelineMetric } from '../../domain/entities/pipeline-metric.entity';

@Injectable()
export class PrismaPipelineMetricRepository extends IPipelineMetricRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: any): PipelineMetric {
    return PipelineMetric.reconstitute({
      id: record.id,
      date: record.date,
      metricName: record.metricName,
      metricValue: record.metricValue,
      dimensions: record.dimensions as Record<string, unknown>,
      createdAt: record.createdAt,
    });
  }

  async findByDateRange(from: Date, to: Date): Promise<PipelineMetric[]> {
    const records = await this.prisma.metriquesDaily.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    return records.map((r: any) => this.toDomain(r));
  }

  async findByMetricName(metricName: string): Promise<PipelineMetric[]> {
    const records = await this.prisma.metriquesDaily.findMany({
      where: { metricName },
      orderBy: { date: 'desc' },
    });
    return records.map((r: any) => this.toDomain(r));
  }

  async save(metric: PipelineMetric): Promise<PipelineMetric> {
    const plain = metric.toPlainObject();
    const record = await this.prisma.metriquesDaily.create({
      data: {
        id: plain.id,
        date: plain.date,
        metricName: plain.metricName,
        metricValue: plain.metricValue,
        dimensions: plain.dimensions as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
    return this.toDomain(record);
  }

  async aggregateByPeriod(
    metricName: string,
    from: Date,
    to: Date,
  ): Promise<{ period: string; total: number }[]> {
    // TODO: implement GROUP BY period aggregation via raw query
    return [];
  }
}
