import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IDealRepository } from '../../domain/repositories/i-deal.repository';
import { Deal, DealStage, StageHistoryEntry } from '../../domain/entities/deal.entity';
import { DealCrm as PrismaDeal } from '@prisma/client';

// Prisma client was generated from a prior schema version; cast enum values via unknown
type AnyStage = unknown;

const ACTIVE_STAGES: AnyStage[] = [
  DealStage.QUALIFICATION,
  DealStage.DEVIS_CREE,
  DealStage.DEVIS_EN_CONSIDERATION,
  DealStage.NEGOCIATION,
  DealStage.SIGNATURE_EN_COURS,
];

const TERMINAL_STAGES: AnyStage[] = [DealStage.GAGNE, DealStage.PERDU];

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
      stage: record.stage as unknown as DealStage,
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
    const records = await this.prisma.dealCrm.findMany({ where: { stage: stage as unknown as never } });
    return records.map((r) => this.toDomain(r));
  }

  async findActiveByProspectId(prospectId: string): Promise<Deal[]> {
    const records = await this.prisma.dealCrm.findMany({
      where: {
        prospectId,
        stage: { in: ACTIVE_STAGES as never[] },
      },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findStaleDeals(cutoffDate: Date): Promise<Deal[]> {
    const records = await this.prisma.dealCrm.findMany({
      where: {
        updatedAt: { lt: cutoffDate },
        stage: { notIn: TERMINAL_STAGES as never[] },
      },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findAll(pagination: { take: number; skip: number }): Promise<Deal[]> {
    const records = await this.prisma.dealCrm.findMany({
      orderBy: { updatedAt: 'desc' },
      take: pagination.take,
      skip: pagination.skip,
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(deal: Deal): Promise<Deal> {
    const plain = deal.toPlainObject();
    const record = await this.prisma.dealCrm.create({
      data: {
        id: plain.id,
        prospectId: plain.prospectId,
        title: plain.title,
        stage: plain.stage as unknown as never,
        amountEur: plain.amountEur,
        probability: plain.probability,
        expectedCloseDate: plain.expectedCloseDate,
        stageHistory: plain.stageHistory as unknown as never,
      },
    });
    return this.toDomain(record);
  }

  async update(deal: Deal): Promise<Deal> {
    const plain = deal.toPlainObject();
    const record = await this.prisma.dealCrm.update({
      where: { id: plain.id },
      data: {
        stage: plain.stage as unknown as never,
        amountEur: plain.amountEur,
        probability: plain.probability,
        expectedCloseDate: plain.expectedCloseDate,
        closedAt: plain.closedAt,
        wonReason: plain.wonReason,
        lostReason: plain.lostReason,
        stageHistory: plain.stageHistory as unknown as never,
      },
    });
    return this.toDomain(record);
  }
}
