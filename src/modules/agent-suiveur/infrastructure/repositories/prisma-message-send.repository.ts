import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { IMessageSendRepository } from '../../domain/repositories/i-message-send.repository';
import { MessageSend } from '../../domain/entities/message-send.entity';
import { EmailSend as PrismaMessageSend } from '@prisma/client';

@Injectable()
export class PrismaMessageSendRepository extends IMessageSendRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private toDomain(record: PrismaMessageSend): MessageSend {
    return MessageSend.reconstitute({
      id: record.id,
      prospectId: record.prospectId,
      messageId: record.messageId ?? '',
      sequenceId: record.sequenceId ?? '',
      fromEmail: record.fromEmail,
      toEmail: record.toEmail,
      subject: record.subject,
      status: record.status as string,
      sentAt: record.sentAt ?? undefined,
      deliveredAt: record.deliveredAt ?? undefined,
      openedAt: record.openedAt ?? undefined,
      repliedAt: record.repliedAt ?? undefined,
      createdAt: record.createdAt,
    });
  }

  async findById(id: string): Promise<MessageSend | null> {
    const record = await this.prisma.emailSend.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByProspectId(prospectId: string): Promise<MessageSend[]> {
    const records = await this.prisma.emailSend.findMany({
      where: { prospectId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(messageSend: MessageSend): Promise<MessageSend> {
    const plain = messageSend.toPlainObject();
    const record = await this.prisma.emailSend.create({
      data: {
        id: plain.id,
        prospectId: plain.prospectId,
        messageId: plain.messageId || undefined,
        sequenceId: plain.sequenceId || undefined,
        fromEmail: plain.fromEmail,
        toEmail: plain.toEmail,
        subject: plain.subject,
        provider: 'unknown',
        status: plain.status as any,
      },
    });
    return this.toDomain(record);
  }

  async updateStatus(messageSend: MessageSend): Promise<MessageSend> {
    const plain = messageSend.toPlainObject();
    const record = await this.prisma.emailSend.update({
      where: { id: plain.id },
      data: {
        status: plain.status as any,
        sentAt: plain.sentAt,
        deliveredAt: plain.deliveredAt,
        openedAt: plain.openedAt,
        repliedAt: plain.repliedAt,
      },
    });
    return this.toDomain(record);
  }
}
