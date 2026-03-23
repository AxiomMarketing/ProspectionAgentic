import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { Customer } from '../../domain/entities/customer.entity';
import { Customer as PrismaCustomer } from '@prisma/client';

@Injectable()
export class PrismaCustomerRepository extends ICustomerRepository {
  constructor(private readonly prisma: PrismaService) { super(); }

  private toDomain(record: PrismaCustomer): Customer {
    return Customer.reconstitute({
      id: record.id,
      companyName: record.companyName,
      siren: record.siren ?? undefined,
      primaryContactId: record.primaryContactId ?? undefined,
      contractStartDate: record.contractStartDate ?? undefined,
      mrrEur: Number(record.mrrEur),
      plan: record.plan ?? undefined,
      status: record.status as any,
      churnedAt: record.churnedAt ?? undefined,
      churnReason: record.churnReason ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findBySiren(siren: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findFirst({ where: { siren } });
    return record ? this.toDomain(record) : null;
  }

  async findActive(): Promise<Customer[]> {
    const records = await this.prisma.customer.findMany({ where: { status: 'active' } });
    return records.map((r) => this.toDomain(r));
  }

  async findChurnRisk(scoreThreshold: number): Promise<Customer[]> {
    const records = await this.prisma.customer.findMany({
      where: {
        status: 'active',
        healthScores: { some: { isLatest: true, healthScore: { lt: scoreThreshold } } },
      },
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(customer: Customer): Promise<Customer> {
    const plain = customer.toPlainObject();
    const record = await this.prisma.customer.create({
      data: {
        id: plain.id,
        companyName: plain.companyName,
        siren: plain.siren,
        primaryContactId: plain.primaryContactId,
        contractStartDate: plain.contractStartDate,
        mrrEur: plain.mrrEur,
        plan: plain.plan,
        status: plain.status,
      },
    });
    return this.toDomain(record);
  }

  async update(customer: Customer): Promise<Customer> {
    const plain = customer.toPlainObject();
    const record = await this.prisma.customer.update({
      where: { id: plain.id },
      data: {
        status: plain.status,
        churnedAt: plain.churnedAt,
        churnReason: plain.churnReason,
        mrrEur: plain.mrrEur,
        plan: plain.plan,
      },
    });
    return this.toDomain(record);
  }
}
