export enum TenderStatus {
  DETECTED = 'DETECTED',
  ANALYZING = 'ANALYZING',
  QUALIFIED = 'QUALIFIED',
  GO = 'GO',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  WON = 'WON',
  LOST = 'LOST',
  IGNORED = 'IGNORED',
}

const VALID_TRANSITIONS: Record<TenderStatus, TenderStatus[]> = {
  [TenderStatus.DETECTED]: [TenderStatus.ANALYZING, TenderStatus.IGNORED],
  [TenderStatus.ANALYZING]: [TenderStatus.QUALIFIED, TenderStatus.IGNORED],
  [TenderStatus.QUALIFIED]: [TenderStatus.GO, TenderStatus.IGNORED],
  [TenderStatus.GO]: [TenderStatus.IN_PROGRESS, TenderStatus.IGNORED],
  [TenderStatus.IN_PROGRESS]: [TenderStatus.SUBMITTED, TenderStatus.LOST],
  [TenderStatus.SUBMITTED]: [TenderStatus.WON, TenderStatus.LOST],
  [TenderStatus.WON]: [],
  [TenderStatus.LOST]: [],
  [TenderStatus.IGNORED]: [],
};

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
      status: TenderStatus.DETECTED,
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

  canTransitionTo(next: TenderStatus): boolean {
    return VALID_TRANSITIONS[this.props.status].includes(next);
  }

  transitionTo(next: TenderStatus): Tender {
    if (!this.canTransitionTo(next)) {
      throw new Error(
        `Invalid transition: ${this.props.status} → ${next}. Allowed: ${VALID_TRANSITIONS[this.props.status].join(', ') || 'none'}`,
      );
    }
    return new Tender({ ...this.props, status: next });
  }

  markAnalyzed(dceFitScore: number): Tender {
    if (!this.canTransitionTo(TenderStatus.ANALYZING)) {
      throw new Error(
        `Invalid transition: ${this.props.status} → ${TenderStatus.ANALYZING}. Allowed: ${VALID_TRANSITIONS[this.props.status].join(', ') || 'none'}`,
      );
    }
    return new Tender({
      ...this.props,
      status: TenderStatus.ANALYZING,
      dceFitScore,
      dceAnalyzed: true,
    });
  }

  toPlainObject(): TenderProps {
    return { ...this.props };
  }
}
