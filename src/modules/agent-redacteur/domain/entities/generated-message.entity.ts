export interface GeneratedMessageProps {
  id: string;
  prospectId: string;
  templateId?: string;
  channel: string;
  subject: string;
  body: string;
  stepNumber: number;
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
  costEur: number;
  generationMs: number;
  isApproved: boolean;
  createdAt: Date;
}

export class GeneratedMessage {
  private constructor(private readonly props: GeneratedMessageProps) {}

  static create(
    params: Omit<GeneratedMessageProps, 'id' | 'isApproved' | 'createdAt' | 'stepNumber'> & { stepNumber?: number },
  ): GeneratedMessage {
    return new GeneratedMessage({
      ...params,
      stepNumber: params.stepNumber ?? 1,
      id: crypto.randomUUID(),
      isApproved: false,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: GeneratedMessageProps): GeneratedMessage {
    return new GeneratedMessage(props);
  }

  get id(): string {
    return this.props.id;
  }
  get prospectId(): string {
    return this.props.prospectId;
  }
  get templateId(): string | undefined {
    return this.props.templateId;
  }
  get channel(): string {
    return this.props.channel;
  }
  get subject(): string {
    return this.props.subject;
  }
  get body(): string {
    return this.props.body;
  }
  get stepNumber(): number {
    return this.props.stepNumber;
  }
  get modelUsed(): string {
    return this.props.modelUsed;
  }
  get promptTokens(): number {
    return this.props.promptTokens;
  }
  get completionTokens(): number {
    return this.props.completionTokens;
  }
  get costEur(): number {
    return this.props.costEur;
  }
  get generationMs(): number {
    return this.props.generationMs;
  }
  get isApproved(): boolean {
    return this.props.isApproved;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  approve(): GeneratedMessage {
    return new GeneratedMessage({ ...this.props, isApproved: true });
  }

  toPlainObject(): GeneratedMessageProps {
    return { ...this.props };
  }
}
