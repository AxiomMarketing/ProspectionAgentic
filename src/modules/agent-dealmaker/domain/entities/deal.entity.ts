export enum DealStage {
  DISCOVERY = 'DISCOVERY',
  QUALIFICATION = 'QUALIFICATION',
  PROPOSAL = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  CLOSED_WON = 'CLOSED_WON',
  CLOSED_LOST = 'CLOSED_LOST',
}

export interface StageHistoryEntry {
  stage: DealStage;
  enteredAt: Date;
}

export interface DealProps {
  id: string;
  prospectId: string;
  customerId?: string;
  title: string;
  stage: DealStage;
  amountEur?: number;
  probability?: number;
  expectedCloseDate?: Date;
  closedAt?: Date;
  wonReason?: string;
  lostReason?: string;
  stageHistory: StageHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export class Deal {
  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    DISCOVERY: ['QUALIFICATION', 'CLOSED_LOST'],
    QUALIFICATION: ['PROPOSAL', 'CLOSED_LOST'],
    PROPOSAL: ['NEGOTIATION', 'CLOSED_LOST'],
    NEGOTIATION: ['CLOSED_WON', 'CLOSED_LOST'],
    CLOSED_WON: [],
    CLOSED_LOST: [],
  };

  private constructor(private readonly props: DealProps) {}

  static create(
    params: Pick<
      DealProps,
      'prospectId' | 'title' | 'amountEur' | 'probability' | 'expectedCloseDate'
    >,
  ): Deal {
    const now = new Date();
    return new Deal({
      ...params,
      id: crypto.randomUUID(),
      stage: DealStage.DISCOVERY,
      stageHistory: [{ stage: DealStage.DISCOVERY, enteredAt: now }],
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: DealProps): Deal {
    return new Deal(props);
  }

  get id(): string {
    return this.props.id;
  }
  get prospectId(): string {
    return this.props.prospectId;
  }
  get customerId(): string | undefined {
    return this.props.customerId;
  }
  get title(): string {
    return this.props.title;
  }
  get stage(): DealStage {
    return this.props.stage;
  }
  get amountEur(): number | undefined {
    return this.props.amountEur;
  }
  get probability(): number | undefined {
    return this.props.probability;
  }
  get expectedCloseDate(): Date | undefined {
    return this.props.expectedCloseDate;
  }
  get closedAt(): Date | undefined {
    return this.props.closedAt;
  }
  get wonReason(): string | undefined {
    return this.props.wonReason;
  }
  get lostReason(): string | undefined {
    return this.props.lostReason;
  }
  get stageHistory(): StageHistoryEntry[] {
    return [...this.props.stageHistory];
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  advanceStage(newStage: DealStage): Deal {
    const allowed = Deal.VALID_TRANSITIONS[this.props.stage] ?? [];
    if (!allowed.includes(newStage)) {
      throw new Error(`Invalid transition: ${this.props.stage} → ${newStage}`);
    }
    return new Deal({
      ...this.props,
      stage: newStage,
      stageHistory: [...this.props.stageHistory, { stage: newStage, enteredAt: new Date() }],
      updatedAt: new Date(),
    });
  }

  close(won: boolean, reason: string): Deal {
    const stage = won ? DealStage.CLOSED_WON : DealStage.CLOSED_LOST;
    return new Deal({
      ...this.props,
      stage,
      closedAt: new Date(),
      wonReason: won ? reason : undefined,
      lostReason: won ? undefined : reason,
      stageHistory: [...this.props.stageHistory, { stage, enteredAt: new Date() }],
      updatedAt: new Date(),
    });
  }

  toPlainObject(): DealProps {
    return { ...this.props, stageHistory: [...this.props.stageHistory] };
  }
}
