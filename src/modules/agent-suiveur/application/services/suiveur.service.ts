import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IMessageSendRepository } from '../../domain/repositories/i-message-send.repository';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { MessageSend } from '../../domain/entities/message-send.entity';
import { ExecuteStepDto } from '../dtos/execute-step.dto';

@Injectable()
export class SuiveurService {
  private readonly logger = new Logger(SuiveurService.name);

  constructor(
    private readonly messageSendRepository: IMessageSendRepository,
    private readonly emailAdapter: IEmailAdapter,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async executeSequenceStep(dto: ExecuteStepDto): Promise<MessageSend> {
    this.logger.log({ msg: 'Executing sequence step', prospectId: dto.prospectId, sequenceId: dto.sequenceId });

    // TODO: fetch sequence step config and prospect contact data
    // TODO: fetch generated message for this step
    const fromEmail = 'noreply@axiom-marketing.fr';
    const toEmail = 'prospect@example.com';
    const subject = 'Votre projet digital';
    const messageId = crypto.randomUUID();

    const messageSend = MessageSend.create({
      prospectId: dto.prospectId,
      messageId,
      sequenceId: dto.sequenceId,
      fromEmail,
      toEmail,
      subject,
    });

    try {
      const saved = await this.messageSendRepository.save(messageSend);

      await this.emailAdapter.sendEmail({
        from: fromEmail,
        to: [toEmail],
        subject,
        htmlBody: '<p>Message content here</p>',
      });

      const sent = saved.markAsSent();
      const updated = await this.messageSendRepository.updateStatus(sent);

      this.eventEmitter.emit('message.sent', { prospectId: dto.prospectId, messageSendId: updated.id });
      this.logger.log({ msg: 'Sequence step executed', prospectId: dto.prospectId, messageSendId: updated.id });

      return updated;
    } catch (error) {
      // Mark as failed if email send fails
      const failed = messageSend.markAsFailed((error as Error).message);
      await this.messageSendRepository.save(failed);
      throw error;
    }
  }

  async detectResponses(): Promise<void> {
    this.logger.log({ msg: 'Detecting email responses' });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const replies = await this.emailAdapter.getUnreadReplies(since);

    for (const reply of replies) {
      this.logger.log({ msg: 'Reply detected', messageId: reply.messageId, from: reply.from });
      // TODO: match reply to prospect via message-id header
      // TODO: update MessageSend status to 'replied'
      // TODO: emit 'response.detected' event
      await this.emailAdapter.markAsRead(reply.messageId);
    }

    this.logger.log({ msg: 'Response detection complete', repliesFound: replies.length });
  }

  async getSendsByProspectId(prospectId: string): Promise<MessageSend[]> {
    return this.messageSendRepository.findByProspectId(prospectId);
  }
}
