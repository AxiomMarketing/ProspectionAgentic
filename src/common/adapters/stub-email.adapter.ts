import { Injectable, Logger } from '@nestjs/common';
import { IEmailAdapter, SendEmailRequest, SendEmailResponse, EmailThreadMessage } from '@common/ports/i-email.adapter';

@Injectable()
export class StubEmailAdapter extends IEmailAdapter {
  private readonly logger = new Logger(StubEmailAdapter.name);

  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    this.logger.warn({ msg: 'StubEmailAdapter: email not sent — email adapter not configured', to: request.to, subject: request.subject });
    return {
      messageId: `stub-${crypto.randomUUID()}`,
      accepted: request.to,
      rejected: [],
      provider: 'stub',
    };
  }

  async getUnreadReplies(_since: Date): Promise<EmailThreadMessage[]> {
    this.logger.warn('StubEmailAdapter: getUnreadReplies not implemented — email adapter not configured');
    return [];
  }

  async markAsRead(_messageId: string): Promise<void> {
    this.logger.warn('StubEmailAdapter: markAsRead not implemented — email adapter not configured');
  }

  async isAvailable(): Promise<boolean> {
    this.logger.warn('StubEmailAdapter: email not available — stub adapter in use');
    return false;
  }
}
