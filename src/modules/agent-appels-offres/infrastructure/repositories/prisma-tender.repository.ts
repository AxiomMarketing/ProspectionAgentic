import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { ITenderRepository } from '../../domain/repositories/i-tender.repository';
import { Tender, TenderStatus } from '../../domain/entities/tender.entity';
import { PublicTender as PrismaTender } from '@prisma/client';

@Injectable()
export class PrismaTenderRepository extends ITenderRepository {
  constructor(private readonly prisma: PrismaService) { super(); }

  private toDomain(record: PrismaTender): Tender {
    return Tender.reconstitute({
      id: record.id,
      source: record.source,
      sourceId: record.sourceId,
      sourceUrl: record.sourceUrl ?? undefined,
      title: record.title,
      description: record.description ?? undefined,
      buyerName: record.buyerName ?? undefined,
      buyerSiren: record.buyerSiren ?? undefined,
      publicationDate: record.publicationDate ?? undefined,
      deadlineDate: record.deadlineDate ?? undefined,
      estimatedAmount: record.estimatedAmount ? Number(record.estimatedAmount) : undefined,
      status: record.status as TenderStatus,
      dceFitScore: record.dceFitScore ?? undefined,
      dceAnalyzed: record.dceAnalyzed,
      createdAt: record.createdAt,
    });
  }

  async findById(id: string): Promise<Tender | null> {
    const record = await this.prisma.publicTender.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByStatus(status: TenderStatus): Promise<Tender[]> {
    const records = await this.prisma.publicTender.findMany({ where: { status: status as any } });
    return records.map((r) => this.toDomain(r));
  }

  async findUpcoming(before: Date): Promise<Tender[]> {
    const records = await this.prisma.publicTender.findMany({
      where: { deadlineDate: { lte: before }, status: { not: TenderStatus.IGNORED as any } },
      orderBy: { deadlineDate: 'asc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(tender: Tender): Promise<Tender> {
    const plain = tender.toPlainObject();
    const record = await this.prisma.publicTender.create({
      data: {
        id: plain.id,
        source: plain.source,
        sourceId: plain.sourceId,
        sourceUrl: plain.sourceUrl,
        title: plain.title,
        description: plain.description,
        buyerName: plain.buyerName,
        buyerSiren: plain.buyerSiren,
        publicationDate: plain.publicationDate,
        deadlineDate: plain.deadlineDate,
        estimatedAmount: plain.estimatedAmount,
        status: plain.status as any,
        dceAnalyzed: plain.dceAnalyzed,
      },
    });
    return this.toDomain(record);
  }

  async update(tender: Tender): Promise<Tender> {
    const plain = tender.toPlainObject();
    const record = await this.prisma.publicTender.update({
      where: { id: plain.id },
      data: {
        status: plain.status as any,
        dceFitScore: plain.dceFitScore,
        dceAnalyzed: plain.dceAnalyzed,
      },
    });
    return this.toDomain(record);
  }
}
