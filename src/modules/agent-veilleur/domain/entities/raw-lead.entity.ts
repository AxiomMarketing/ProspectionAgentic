export interface RawLeadProps {
  id: string;
  source: string;
  sourceId: string;
  sourceUrl?: string;
  rawData: Record<string, unknown>;
  processed: boolean;
  processedAt?: Date;
  prospectId?: string;
  createdAt: Date;
}

export class RawLead {
  private constructor(private readonly props: RawLeadProps) {}

  static create(params: Omit<RawLeadProps, 'id' | 'processed' | 'createdAt'>): RawLead {
    return new RawLead({
      ...params,
      id: crypto.randomUUID(),
      processed: false,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: RawLeadProps): RawLead {
    return new RawLead(props);
  }

  get id(): string { return this.props.id; }
  get source(): string { return this.props.source; }
  get sourceId(): string { return this.props.sourceId; }
  get sourceUrl(): string | undefined { return this.props.sourceUrl; }
  get rawData(): Record<string, unknown> { return this.props.rawData; }
  get processed(): boolean { return this.props.processed; }
  get processedAt(): Date | undefined { return this.props.processedAt; }
  get prospectId(): string | undefined { return this.props.prospectId; }
  get createdAt(): Date { return this.props.createdAt; }

  markAsProcessed(prospectId: string): RawLead {
    return new RawLead({ ...this.props, processed: true, processedAt: new Date(), prospectId });
  }

  toPlainObject(): RawLeadProps { return { ...this.props }; }
}
