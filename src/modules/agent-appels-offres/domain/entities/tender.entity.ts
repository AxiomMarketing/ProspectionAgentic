export enum TenderStatus {
  NEW = 'NEW',
  ANALYZING = 'ANALYZING',
  ANALYZED = 'ANALYZED',
  SUBMITTED = 'SUBMITTED',
  WON = 'WON',
  LOST = 'LOST',
  IGNORED = 'IGNORED',
}

export interface TenderProps {
  id: string;
  source: string;
  sourceId: string;
  sourceUrl?: string;
  title: string;
  description?: string;
  buyerName?: string;
  buyerSiren?: string;
  publicationDate?: Date;
  deadlineDate?: Date;
  estimatedAmount?: number;
  status: TenderStatus;
  dceFitScore?: number;
  dceAnalyzed: boolean;
  createdAt: Date;
}

export class Tender {
  private constructor(private readonly props: TenderProps) {}

  static create(params: Omit<TenderProps, 'id' | 'status' | 'dceAnalyzed' | 'createdAt'>): Tender {
    return new Tender({
      ...params,
      id: crypto.randomUUID(),
      status: TenderStatus.NEW,
      dceAnalyzed: false,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: TenderProps): Tender {
    return new Tender(props);
  }

  get id(): string {
    return this.props.id;
  }
  get source(): string {
    return this.props.source;
  }
  get sourceId(): string {
    return this.props.sourceId;
  }
  get sourceUrl(): string | undefined {
    return this.props.sourceUrl;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get buyerName(): string | undefined {
    return this.props.buyerName;
  }
  get buyerSiren(): string | undefined {
    return this.props.buyerSiren;
  }
  get publicationDate(): Date | undefined {
    return this.props.publicationDate;
  }
  get deadlineDate(): Date | undefined {
    return this.props.deadlineDate;
  }
  get estimatedAmount(): number | undefined {
    return this.props.estimatedAmount;
  }
  get status(): TenderStatus {
    return this.props.status;
  }
  get dceFitScore(): number | undefined {
    return this.props.dceFitScore;
  }
  get dceAnalyzed(): boolean {
    return this.props.dceAnalyzed;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  markAnalyzed(dceFitScore: number): Tender {
    return new Tender({
      ...this.props,
      status: TenderStatus.ANALYZED,
      dceFitScore,
      dceAnalyzed: true,
    });
  }

  updateStatus(status: TenderStatus): Tender {
    return new Tender({ ...this.props, status });
  }

  toPlainObject(): TenderProps {
    return { ...this.props };
  }
}
