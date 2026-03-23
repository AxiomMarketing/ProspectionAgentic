export interface SendEmailRequest {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
  tags?: string[];
}

export interface SendEmailResponse {
  messageId: string;
  accepted: string[];
  rejected: string[];
  provider: string;
}

export interface EmailThreadMessage {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
  isRead: boolean;
}

export abstract class IEmailAdapter {
  abstract sendEmail(request: SendEmailRequest): Promise<SendEmailResponse>;
  abstract getUnreadReplies(since: Date): Promise<EmailThreadMessage[]>;
  abstract markAsRead(messageId: string): Promise<void>;
  abstract isAvailable(): Promise<boolean>;
}
