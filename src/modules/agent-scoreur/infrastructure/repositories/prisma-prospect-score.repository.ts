import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IProspectScoreRepository } from '../../domain/repositories/i-prospect-score.repository';
import { ProspectScore } from '../../domain/entities/prospect-score.entity';
import { ProspectScore as PrismaProspectScore } from '@prisma/client';

@Injectable()
export class PrismaProspectScoreRepository extends IProspectScoreRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaProspectScore): ProspectScore {
    return ProspectScore.reconstitute({
      id: record.id,
      prospectId: record.prospectId,
      totalScore: record.totalScore,
      firmographicScore: record.firmographicScore,
      technographicScore: record.technographicScore,
      behavioralScore: record.behavioralScore,
      engagementScore: record.engagementScore,
      intentScore: record.intentScore,
      accessibilityScore: record.accessibilityScore,
      segment: record.segment ?? '',
      isLatest: record.isLatest,
      modelVersion: record.modelVersion,
      calculatedAt: record.calculatedAt,
    });
  }

  async findLatestByProspectId(prospectId: string): Promise<ProspectScore | null> {
    const record = await this.prisma.prospectScore.findFirst({
      where: { prospectId, isLatest: true },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByProspectId(prospectId: string): Promise<ProspectScore[]> {
    const records = await this.prisma.prospectScore.findMany({
      where: { prospectId },
      orderBy: { calculatedAt: 'desc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(score: ProspectScore): Promise<ProspectScore> {
    const plain = score.toPlainObject();

    const [, created] = await this.prisma.$transaction([
      this.prisma.prospectScore.updateMany({
        where: { prospectId: plain.prospectId, isLatest: true },
        data: { isLatest: false },
      }),
      this.prisma.prospectScore.create({
        data: {
          id: plain.id,
          prospectId: plain.prospectId,
          totalScore: plain.totalScore,
          firmographicScore: plain.firmographicScore,
          technographicScore: plain.technographicScore,
          behavioralScore: plain.behavioralScore,
          engagementScore: plain.engagementScore,
          intentScore: plain.intentScore,
          accessibilityScore: plain.accessibilityScore,
          segment: plain.segment,
          isLatest: plain.isLatest,
          modelVersion: plain.modelVersion,
          calculatedAt: plain.calculatedAt,
        },
      }),
    ]);
    return this.toDomain(created);
  }
}
