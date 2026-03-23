import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IHealthScoreRepository } from '../../domain/repositories/i-health-score.repository';
import { HealthScore } from '../../domain/entities/health-score.entity';
import { CustomerHealthScore as PrismaHealthScore } from '@prisma/client';

@Injectable()
export class PrismaHealthScoreRepository extends IHealthScoreRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaHealthScore): HealthScore {
    return HealthScore.reconstitute({
      id: record.id,
      customerId: record.customerId,
      healthScore: record.healthScore,
      healthLabel: record.healthLabel ?? undefined,
      usageScore: record.usageScore ?? undefined,
      supportScore: record.supportScore ?? undefined,
      financialScore: record.financialScore ?? undefined,
      engagementScore: record.engagementScore ?? undefined,
      npsScore: record.npsScore ?? undefined,
      signals: record.signals as Record<string, unknown>,
      isLatest: record.isLatest,
      calculatedAt: record.calculatedAt,
    });
  }

  async findLatestByCustomerId(customerId: string): Promise<HealthScore | null> {
    const record = await this.prisma.customerHealthScore.findFirst({
      where: { customerId, isLatest: true },
    });
    return record ? this.toDomain(record) : null;
  }

  async save(healthScore: HealthScore): Promise<HealthScore> {
    const plain = healthScore.toPlainObject();
    const record = await this.prisma.customerHealthScore.upsert({
      where: { id: plain.id },
      create: {
        id: plain.id,
        customerId: plain.customerId,
        healthScore: plain.healthScore,
        healthLabel: plain.healthLabel,
        usageScore: plain.usageScore,
        supportScore: plain.supportScore,
        financialScore: plain.financialScore,
        engagementScore: plain.engagementScore,
        npsScore: plain.npsScore,
        signals: plain.signals as unknown as import('@prisma/client').Prisma.InputJsonValue,
        isLatest: plain.isLatest,
        calculatedAt: plain.calculatedAt,
      },
      update: {
        isLatest: plain.isLatest,
      },
    });
    return this.toDomain(record);
  }
}
