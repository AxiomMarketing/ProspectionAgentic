import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IDealRepository } from '../../domain/repositories/i-deal.repository';
import { Deal, DealStage, StageHistoryEntry } from '../../domain/entities/deal.entity';
import { DealCrm as PrismaDeal } from '@prisma/client';

@Injectable()
export class PrismaDealRepository extends IDealRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaDeal): Deal {
    return Deal.reconstitute({
      id: record.id,
      prospectId: record.prospectId,
      customerId: record.customerId ?? undefined,
      title: record.title,
      stage: record.stage as DealStage,
      amountEur: record.amountEur ? Number(record.amountEur) : undefined,
      probability: record.probability ?? undefined,
      expectedCloseDate: record.expectedCloseDate ?? undefined,
      closedAt: record.closedAt ?? undefined,
      wonReason: record.wonReason ?? undefined,
      lostReason: record.lostReason ?? undefined,
      stageHistory: record.stageHistory as unknown as StageHistoryEntry[],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<Deal | null> {
    const record = await this.prisma.dealCrm.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByProspectId(prospectId: string): Promise<Deal[]> {
    const records = await this.prisma.dealCrm.findMany({ where: { prospectId } });
    return records.map((r) => this.toDomain(r));
  }

  async findByStage(stage: DealStage): Promise<Deal[]> {
    const records = await this.prisma.dealCrm.findMany({ where: { stage: stage as any } });
    return records.map((r) => this.toDomain(r));
  }

  async save(deal: Deal): Promise<Deal> {
    const plain = deal.toPlainObject();
    const record = await this.prisma.dealCrm.create({
      data: {
        id: plain.id,
        prospectId: plain.prospectId,
        title: plain.title,
        stage: plain.stage as any,
        amountEur: plain.amountEur,
        probability: plain.probability,
        expectedCloseDate: plain.expectedCloseDate,
        stageHistory: plain.stageHistory as any,
      },
    });
    return this.toDomain(record);
  }

  async update(deal: Deal): Promise<Deal> {
    const plain = deal.toPlainObject();
    const record = await this.prisma.dealCrm.update({
      where: { id: plain.id },
      data: {
        stage: plain.stage as any,
        amountEur: plain.amountEur,
        probability: plain.probability,
        expectedCloseDate: plain.expectedCloseDate,
        closedAt: plain.closedAt,
        wonReason: plain.wonReason,
        lostReason: plain.lostReason,
        stageHistory: plain.stageHistory as any,
      },
    });
    return this.toDomain(record);
  }
}
