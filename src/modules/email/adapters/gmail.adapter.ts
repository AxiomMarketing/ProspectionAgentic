import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import {
  IEmailAdapter,
  SendEmailRequest,
  SendEmailResponse,
  EmailThreadMessage,
} from '@common/ports/i-email.adapter';

@Injectable()
export class GmailAdapter extends IEmailAdapter {
  private readonly logger = new Logger(GmailAdapter.name);
  private gmail: gmail_v1.Gmail | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
    this.initClient();
  }

  private initClient(): void {
    const clientId = this.configService.get<string>('GMAIL_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GMAIL_CLIENT_SECRET');
    const refreshToken = this.configService.get<string>('GMAIL_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.warn('Gmail credentials not configured — adapter unavailable');
      return;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }

  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    if (!this.gmail) {
      throw new Error('Gmail adapter not configured — set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN');
    }

    const rawEmail = this.buildRawEmail(request);

    try {
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: Buffer.from(rawEmail).toString('base64url'),
        },
      });

      this.logger.log({
        msg: 'Email sent via Gmail',
        messageId: response.data.id,
        to: request.to,
      });

      return {
        messageId: response.data.id ?? '',
        accepted: request.to,
        rejected: [],
        provider: 'gmail',
      };
    } catch (error) {
      this.logger.error({
        msg: 'Gmail send failed',
        error: (error as Error).message,
        to: request.to,
      });
      throw error;
    }
  }

  async getUnreadReplies(since: Date): Promise<EmailThreadMessage[]> {
    if (!this.gmail) return [];

    try {
      const afterTimestamp = Math.floor(since.getTime() / 1000);
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: `is:unread after:${afterTimestamp}`,
        maxResults: 50,
      });

      if (!response.data.messages) return [];

      const messages: EmailThreadMessage[] = [];
      for (const msg of response.data.messages) {
        const detail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const headers = detail.data.payload?.headers ?? [];
        const from = headers.find((h) => h.name === 'From')?.value ?? '';
        const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
        const date = headers.find((h) => h.name === 'Date')?.value;
        const body = this.extractBody(detail.data);

        messages.push({
          messageId: msg.id!,
          from,
          subject,
          body,
          receivedAt: date ? new Date(date) : new Date(),
          isRead: false,
        });
      }

      return messages;
    } catch (error) {
      this.logger.error({ msg: 'Gmail fetch replies failed', error: (error as Error).message });
      return [];
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    if (!this.gmail) return;

    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
  }

  async isAvailable(): Promise<boolean> {
    if (!this.gmail) return false;
    try {
      await this.gmail.users.getProfile({ userId: 'me' });
      return true;
    } catch {
      return false;
    }
  }

  private buildRawEmail(request: SendEmailRequest): string {
    const to = request.to.join(', ');
    const cc = request.cc?.join(', ') ?? '';
    const plainBody = request.htmlBody.replace(/<[^>]*>/g, '');
    const customHeaders = request.headers
      ? Object.entries(request.headers).map(([key, value]) => `${key}: ${value}`)
      : [];
    const lines = [
      `From: ${request.from}`,
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      `Subject: ${request.subject}`,
      ...(request.replyTo ? [`Reply-To: ${request.replyTo}`] : []),
      ...customHeaders,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      plainBody,
    ];
    return lines.join('\r\n');
  }

  private extractBody(message: gmail_v1.Schema$Message): string {
    const parts = message.payload?.parts;
    if (parts) {
      const textPart = parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }
    if (message.payload?.body?.data) {
      return Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }
    return message.snippet ?? '';
  }
}
