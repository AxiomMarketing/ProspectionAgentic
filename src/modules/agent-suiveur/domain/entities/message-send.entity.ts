export interface MessageSendProps {
  id: string;
  prospectId: string;
  messageId: string;
  sequenceId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  status: string;
  failureReason?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  repliedAt?: Date;
  createdAt: Date;
}

export class MessageSend {
  private constructor(private readonly props: MessageSendProps) {}

  static create(params: Omit<MessageSendProps, 'id' | 'status' | 'createdAt'>): MessageSend {
    return new MessageSend({
      ...params,
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: new Date(),
    });
  }

  static reconstitute(props: MessageSendProps): MessageSend {
    return new MessageSend(props);
  }

  get id(): string { return this.props.id; }
  get prospectId(): string { return this.props.prospectId; }
  get messageId(): string { return this.props.messageId; }
  get sequenceId(): string { return this.props.sequenceId; }
  get fromEmail(): string { return this.props.fromEmail; }
  get toEmail(): string { return this.props.toEmail; }
  get subject(): string { return this.props.subject; }
  get status(): string { return this.props.status; }
  get sentAt(): Date | undefined { return this.props.sentAt; }
  get deliveredAt(): Date | undefined { return this.props.deliveredAt; }
  get openedAt(): Date | undefined { return this.props.openedAt; }
  get repliedAt(): Date | undefined { return this.props.repliedAt; }
  get createdAt(): Date { return this.props.createdAt; }

  markAsSent(): MessageSend {
    return new MessageSend({ ...this.props, status: 'sent', sentAt: new Date() });
  }

  markAsDelivered(): MessageSend {
    return new MessageSend({ ...this.props, status: 'delivered', deliveredAt: new Date() });
  }

  markAsOpened(): MessageSend {
    return new MessageSend({ ...this.props, status: 'opened', openedAt: new Date() });
  }

  markAsReplied(): MessageSend {
    return new MessageSend({ ...this.props, status: 'replied', repliedAt: new Date() });
  }

  markAsFailed(reason: string): MessageSend {
    return new MessageSend({ ...this.props, status: 'failed', failureReason: reason });
  }

  toPlainObject(): MessageSendProps { return { ...this.props }; }
}
