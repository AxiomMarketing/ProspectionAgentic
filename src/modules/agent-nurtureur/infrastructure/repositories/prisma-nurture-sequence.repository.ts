import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { INurtureSequenceRepository } from '../../domain/repositories/i-nurture-sequence.repository';
import { NurtureSequence } from '../../domain/entities/nurture-sequence.entity';
import { NurtureProspect as PrismaNurtureProspect } from '@prisma/client';

@Injectable()
export class PrismaNurtureSequenceRepository extends INurtureSequenceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaNurtureProspect): NurtureSequence {
    return NurtureSequence.reconstitute({
      id: record.id,
      prospectId: record.prospectId,
      entryReason: record.entryReason,
      entryDate: record.entryDate,
      status: record.status as any,
      reactivatedAt: record.reactivatedAt ?? undefined,
      exitReason: record.exitReason ?? undefined,
      tags: record.tags as string[],
    });
  }

  async findById(id: string): Promise<NurtureSequence | null> {
    const record = await this.prisma.nurtureProspect.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByProspectId(prospectId: string): Promise<NurtureSequence | null> {
    const record = await this.prisma.nurtureProspect.findFirst({ where: { prospectId } });
    return record ? this.toDomain(record) : null;
  }

  async findActive(limit = 50): Promise<NurtureSequence[]> {
    const records = await this.prisma.nurtureProspect.findMany({
      where: { status: 'active' },
      orderBy: { entryDate: 'asc' },
      take: limit,
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(sequence: NurtureSequence): Promise<NurtureSequence> {
    const plain = sequence.toPlainObject();
    const record = await this.prisma.nurtureProspect.create({
      data: {
        id: plain.id,
        prospectId: plain.prospectId,
        entryReason: plain.entryReason,
        entryDate: plain.entryDate,
        status: plain.status,
        tags: plain.tags,
      },
    });
    return this.toDomain(record);
  }

  async update(sequence: NurtureSequence): Promise<NurtureSequence> {
    const plain = sequence.toPlainObject();
    const record = await this.prisma.nurtureProspect.update({
      where: { id: plain.id },
      data: {
        status: plain.status,
        reactivatedAt: plain.reactivatedAt,
        exitReason: plain.exitReason,
        tags: plain.tags,
      },
    });
    return this.toDomain(record);
  }
}
