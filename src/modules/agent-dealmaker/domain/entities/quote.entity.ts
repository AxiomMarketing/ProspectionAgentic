export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPriceEur: number;
}

export interface QuoteProps {
  id: string;
  dealId: string;
  prospectId: string;
  quoteNumber: string;
  title: string;
  amountHtEur: number;
  tvaRate: number;
  lineItems: QuoteLineItem[];
  status: QuoteStatus;
  createdAt: Date;
}

export class Quote {
  private constructor(private readonly props: QuoteProps) {}

  static create(params: Omit<QuoteProps, 'id' | 'status' | 'createdAt'>): Quote {
    return new Quote({
      ...params,
      id: crypto.randomUUID(),
      status: 'draft',
      createdAt: new Date(),
    });
  }

  static reconstitute(props: QuoteProps): Quote {
    return new Quote(props);
  }

  get id(): string { return this.props.id; }
  get dealId(): string { return this.props.dealId; }
  get prospectId(): string { return this.props.prospectId; }
  get quoteNumber(): string { return this.props.quoteNumber; }
  get title(): string { return this.props.title; }
  get amountHtEur(): number { return this.props.amountHtEur; }
  get tvaRate(): number { return this.props.tvaRate; }
  get lineItems(): QuoteLineItem[] { return [...this.props.lineItems]; }
  get status(): QuoteStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }

  updateStatus(status: QuoteStatus): Quote {
    return new Quote({ ...this.props, status });
  }

  toPlainObject(): QuoteProps { return { ...this.props, lineItems: [...this.props.lineItems] }; }
}
