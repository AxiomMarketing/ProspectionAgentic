import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IQuoteRepository } from '../../domain/repositories/i-quote.repository';
import { Quote, QuoteLineItem } from '../../domain/entities/quote.entity';
import { Quote as PrismaQuote } from '@prisma/client';

const ACTIVE_QUOTE_STATUSES = ['draft', 'sent', 'accepted'];

@Injectable()
export class PrismaQuoteRepository extends IQuoteRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaQuote): Quote {
    return Quote.reconstitute({
      id: record.id,
      dealId: record.dealId,
      prospectId: record.prospectId,
      quoteNumber: record.quoteNumber,
      title: record.title,
      amountHtEur: Number(record.amountHtEur),
      tvaRate: Number(record.tvaRate),
      lineItems: record.lineItems as unknown as QuoteLineItem[],
      status: record.status as Quote['status'],
      createdAt: record.createdAt,
    });
  }

  async findById(id: string): Promise<Quote | null> {
    const record = await this.prisma.quote.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByDealId(dealId: string): Promise<Quote[]> {
    const records = await this.prisma.quote.findMany({ where: { dealId } });
    return records.map((r) => this.toDomain(r));
  }

  async findActiveByDealId(dealId: string): Promise<Quote[]> {
    const records = await this.prisma.quote.findMany({
      where: {
        dealId,
        status: { in: ACTIVE_QUOTE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async expirePreviousQuotes(dealId: string): Promise<void> {
    await this.prisma.quote.updateMany({
      where: {
        dealId,
        status: { in: ACTIVE_QUOTE_STATUSES },
      },
      data: { status: 'expired' },
    });
  }

  async save(quote: Quote): Promise<Quote> {
    const plain = quote.toPlainObject();
    const record = await this.prisma.quote.create({
      data: {
        id: plain.id,
        dealId: plain.dealId,
        prospectId: plain.prospectId,
        quoteNumber: plain.quoteNumber,
        title: plain.title,
        amountHtEur: plain.amountHtEur,
        tvaRate: plain.tvaRate,
        lineItems: plain.lineItems as object[],
        status: plain.status,
      },
    });
    return this.toDomain(record);
  }

  async update(quote: Quote): Promise<Quote> {
    const plain = quote.toPlainObject();
    const record = await this.prisma.quote.update({
      where: { id: plain.id },
      data: { status: plain.status },
    });
    return this.toDomain(record);
  }
}
