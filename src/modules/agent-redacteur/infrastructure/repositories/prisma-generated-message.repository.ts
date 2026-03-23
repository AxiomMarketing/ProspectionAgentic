import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IGeneratedMessageRepository } from '../../domain/repositories/i-generated-message.repository';
import { GeneratedMessage } from '../../domain/entities/generated-message.entity';
import { GeneratedMessage as PrismaGeneratedMessage } from '@prisma/client';

@Injectable()
export class PrismaGeneratedMessageRepository extends IGeneratedMessageRepository {
  constructor(private readonly prisma: PrismaService) { super(); }

  private toDomain(record: PrismaGeneratedMessage): GeneratedMessage {
    return GeneratedMessage.reconstitute({
      id: record.id,
      prospectId: record.prospectId,
      templateId: record.templateId ?? undefined,
      channel: record.channel as string,
      subject: record.subject ?? '',
      body: record.body,
      modelUsed: record.modelUsed,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      costEur: record.costEur,
      generationMs: record.generationMs,
      isApproved: record.isApproved,
      createdAt: record.createdAt,
    });
  }

  async findById(id: string): Promise<GeneratedMessage | null> {
    const record = await this.prisma.generatedMessage.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByProspectId(prospectId: string): Promise<GeneratedMessage[]> {
    const records = await this.prisma.generatedMessage.findMany({
      where: { prospectId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(message: GeneratedMessage): Promise<GeneratedMessage> {
    const plain = message.toPlainObject();
    const record = await this.prisma.generatedMessage.create({
      data: {
        id: plain.id,
        prospectId: plain.prospectId,
        templateId: plain.templateId,
        channel: plain.channel as any,
        stepNumber: 1,
        subject: plain.subject,
        body: plain.body,
        modelUsed: plain.modelUsed,
        promptTokens: plain.promptTokens,
        completionTokens: plain.completionTokens,
        costEur: plain.costEur,
        generationMs: plain.generationMs,
        isApproved: plain.isApproved,
      },
    });
    return this.toDomain(record);
  }
}
