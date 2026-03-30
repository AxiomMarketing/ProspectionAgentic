import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { IPipelineMetricRepository } from '../../domain/repositories/i-pipeline-metric.repository';
import { PipelineMetric } from '../../domain/entities/pipeline-metric.entity';
import { DailySnapshot } from '../../domain/entities/pipeline-metric.entity';

@Injectable()
export class PrismaPipelineMetricRepository extends IPipelineMetricRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: { id: string; dateSnapshot: Date; createdAt: Date }): PipelineMetric {
    return PipelineMetric.reconstitute({
      id: record.id,
      date: record.dateSnapshot,
      metricName: 'snapshot',
      metricValue: 0,
      dimensions: {},
      createdAt: record.createdAt,
    });
  }

  async findByDateRange(from: Date, to: Date, take = 100, skip = 0): Promise<PipelineMetric[]> {
    const records = await this.prisma.metriquesDaily.findMany({
      where: { dateSnapshot: { gte: from, lte: to } },
      orderBy: { dateSnapshot: 'asc' },
      take,
      skip,
    });
    return records.map((r) => this.toDomain(r));
  }

  async findByMetricName(_metricName: string): Promise<PipelineMetric[]> {
    // MetriquesDaily no longer has metricName — return all recent snapshots
    const records = await this.prisma.metriquesDaily.findMany({
      orderBy: { dateSnapshot: 'desc' },
      take: 30,
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(metric: PipelineMetric): Promise<PipelineMetric> {
    const plain = metric.toPlainObject();
    const record = await this.prisma.metriquesDaily.upsert({
      where: { dateSnapshot: plain.date },
      update: {},
      create: {
        dateSnapshot: plain.date,
      },
    });
    return this.toDomain(record);
  }

  async aggregateByPeriod(
    _metricName: string,
    dateFrom: Date,
    dateTo: Date,
    _period: 'day' | 'week' | 'month' = 'day',
  ): Promise<unknown[]> {
    return this.prisma.metriquesDaily.findMany({
      where: { dateSnapshot: { gte: dateFrom, lte: dateTo } },
      orderBy: { dateSnapshot: 'asc' },
    });
  }

  async findLatestSnapshot(): Promise<DailySnapshot | null> {
    const record = await this.prisma.metriquesDaily.findFirst({
      orderBy: { dateSnapshot: 'desc' },
    });
    return record as DailySnapshot | null;
  }

  async upsertSnapshot(date: Date, data: Partial<DailySnapshot>): Promise<DailySnapshot> {
    const { id: _id, dateSnapshot: _ds, createdAt: _ca, ...rest } = data as DailySnapshot;
    const prismaData = rest as Prisma.MetriquesDailyUpdateInput;

    const createData: Prisma.MetriquesDailyCreateInput = {
      dateSnapshot: date,
      ...(rest as Partial<Prisma.MetriquesDailyCreateInput>),
    };

    const record = await this.prisma.metriquesDaily.upsert({
      where: { dateSnapshot: date },
      update: prismaData,
      create: createData,
    });
    return record as DailySnapshot;
  }
}
