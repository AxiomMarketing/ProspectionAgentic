import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { RawLead as PrismaRawLead } from '@prisma/client';

@Injectable()
export class PrismaRawLeadRepository extends IRawLeadRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaRawLead): RawLead {
    return RawLead.reconstitute({
      id: record.id,
      source: record.source,
      sourceId: record.sourceId,
      sourceUrl: record.sourceUrl ?? undefined,
      rawData: record.rawData as Record<string, unknown>,
      processed: record.processed,
      processedAt: record.processedAt ?? undefined,
      prospectId: record.prospectId ?? undefined,
      createdAt: record.createdAt,
    });
  }

  async findById(id: string): Promise<RawLead | null> {
    const record = await this.prisma.rawLead.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<RawLead | null> {
    const record = await this.prisma.rawLead.findFirst({ where: { sourceUrl } });
    return record ? this.toDomain(record) : null;
  }

  async findPending(limit = 50): Promise<RawLead[]> {
    const records = await this.prisma.rawLead.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(lead: RawLead): Promise<RawLead> {
    const plain = lead.toPlainObject();
    const record = await this.prisma.rawLead.create({
      data: {
        id: plain.id,
        source: plain.source,
        sourceId: plain.sourceId,
        sourceUrl: plain.sourceUrl,
        rawData: plain.rawData as unknown as import('@prisma/client').Prisma.InputJsonValue,
        processed: plain.processed,
      },
    });
    return this.toDomain(record);
  }

  async update(lead: RawLead): Promise<RawLead> {
    const plain = lead.toPlainObject();
    const record = await this.prisma.rawLead.update({
      where: { id: plain.id },
      data: {
        processed: plain.processed,
        processedAt: plain.processedAt,
        prospectId: plain.prospectId,
      },
    });
    return this.toDomain(record);
  }

  async countBySourceSince(source: string, since: Date): Promise<number> {
    return this.prisma.rawLead.count({ where: { source, createdAt: { gte: since } } });
  }

  async findBySourceUrls(urls: string[]): Promise<RawLead[]> {
    if (urls.length === 0) return [];
    const records = await this.prisma.rawLead.findMany({
      where: { sourceUrl: { in: urls } },
    });
    return records.map((r) => this.toDomain(r));
  }
}
