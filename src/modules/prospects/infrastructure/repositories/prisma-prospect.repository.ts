import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import {
  IProspectRepository,
  ProspectFilter,
  PaginatedProspects,
} from '../../domain/repositories/i-prospect.repository';
import { Prospect, ProspectProps } from '../../domain/entities/prospect.entity';
import type { Prospect as PrismaProspect } from '@prisma/client';

@Injectable()
export class PrismaProspectRepository extends IProspectRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaProspect): Prospect {
    return Prospect.reconstitute({
      id: record.id,
      firstName: record.firstName ?? undefined,
      lastName: record.lastName ?? undefined,
      fullName: record.fullName ?? undefined,
      email: record.email ?? undefined,
      emailVerified: record.emailVerified,
      phone: record.phone ?? undefined,
      linkedinUrl: record.linkedinUrl ?? undefined,
      companyName: record.companyName ?? undefined,
      companySiren: record.companySiren ?? undefined,
      companySize: record.companySize ?? undefined,
      companyWebsite: record.companyWebsite ?? undefined,
      jobTitle: record.jobTitle ?? undefined,
      seniorityLevel: record.seniorityLevel ?? undefined,
      isDecisionMaker: record.isDecisionMaker,
      status: record.status,
      enrichmentData: record.enrichmentData as Record<string, unknown> | undefined,
      enrichedAt: record.enrichedAt ?? undefined,
      consentGiven: record.consentGiven,
      consentDate: record.consentDate ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<Prospect | null> {
    const record = await this.prisma.prospect.findUnique({
      where: { id },
      include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } },
    });
    if (!record) return null;
    const domain = this.toDomain(record);
    const latestScore = (record as any).scores?.[0];
    if (latestScore) {
      (domain as any).latestScore = {
        totalScore: latestScore.totalScore,
        firmographicScore: latestScore.firmographicScore,
        technographicScore: latestScore.technographicScore,
        behavioralScore: latestScore.behavioralScore,
        engagementScore: latestScore.engagementScore,
        intentScore: latestScore.intentScore,
        accessibilityScore: latestScore.accessibilityScore,
        segment: latestScore.segment,
        modelVersion: latestScore.modelVersion,
      };
    }
    return domain;
  }

  async findByEmail(email: string): Promise<Prospect | null> {
    const record = await this.prisma.prospect.findFirst({ where: { email } });
    return record ? this.toDomain(record) : null;
  }

  async findByCompanyDomain(domain: string): Promise<Prospect[]> {
    const records = await this.prisma.prospect.findMany({
      where: { companyWebsite: { contains: domain } },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findAll(filter?: ProspectFilter, page = 1, pageSize = 20): Promise<PaginatedProspects> {
    const where: any = {};
    if (filter?.status?.length) where.status = { in: filter.status };
    if (filter?.createdAfter) where.createdAt = { gte: filter.createdAfter };
    if (filter?.search) {
      where.OR = [
        { firstName: { contains: filter.search, mode: 'insensitive' } },
        { lastName: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
        { companyName: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const sortField = filter?.sortBy ?? 'createdAt';
    const sortOrder = filter?.sortOrder ?? 'desc';
    const orderBy: any = { [sortField]: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.prospect.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      this.prisma.prospect.count({ where }),
    ]);

    return {
      data: data.map((r) => this.toDomain(r)),
      total,
      page,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async save(prospect: Prospect): Promise<Prospect> {
    const plain = prospect.toPlainObject();
    const record = await this.prisma.prospect.create({
      data: {
        id: plain.id,
        firstName: plain.firstName,
        lastName: plain.lastName,
        fullName: plain.fullName,
        email: plain.email,
        emailVerified: plain.emailVerified,
        phone: plain.phone,
        linkedinUrl: plain.linkedinUrl,
        companyName: plain.companyName,
        companySiren: plain.companySiren,
        companySize: plain.companySize,
        companyWebsite: plain.companyWebsite,
        jobTitle: plain.jobTitle,
        seniorityLevel: plain.seniorityLevel,
        isDecisionMaker: plain.isDecisionMaker,
        status: plain.status,
        enrichmentData:
          (plain.enrichmentData as unknown as import('@prisma/client').Prisma.InputJsonValue) ??
          undefined,
        consentGiven: plain.consentGiven,
      },
    });
    return this.toDomain(record);
  }

  async update(prospect: Prospect): Promise<Prospect> {
    const plain = prospect.toPlainObject();
    const record = await this.prisma.prospect.update({
      where: { id: plain.id },
      data: {
        firstName: plain.firstName,
        lastName: plain.lastName,
        fullName: plain.fullName,
        email: plain.email,
        phone: plain.phone,
        companyName: plain.companyName,
        status: plain.status,
        enrichmentData:
          (plain.enrichmentData as unknown as import('@prisma/client').Prisma.InputJsonValue) ??
          undefined,
        enrichedAt: plain.enrichedAt,
      },
    });
    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.prospect.delete({ where: { id } });
  }

  async updateScore(
    id: string,
    totalScore: number,
    breakdown?: Record<string, number>,
  ): Promise<void> {
    await this.prisma.prospectScore.create({
      data: {
        prospectId: id,
        totalScore,
        firmographicScore: breakdown?.firmographicScore ?? 0,
        technographicScore: breakdown?.technographicScore ?? 0,
        behavioralScore: breakdown?.behavioralScore ?? 0,
        engagementScore: breakdown?.engagementScore ?? 0,
        intentScore: breakdown?.intentScore ?? 0,
        accessibilityScore: breakdown?.accessibilityScore ?? 0,
        scoreBreakdown: breakdown ?? undefined,
      },
    });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const results = await this.prisma.prospect.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return Object.fromEntries(results.map((r) => [r.status, r._count._all]));
  }
}
