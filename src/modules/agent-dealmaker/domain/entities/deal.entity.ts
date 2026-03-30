export enum DealStage {
  QUALIFICATION = 'QUALIFICATION',
  DEVIS_CREE = 'DEVIS_CREE',
  DEVIS_EN_CONSIDERATION = 'DEVIS_EN_CONSIDERATION',
  NEGOCIATION = 'NEGOCIATION',
  SIGNATURE_EN_COURS = 'SIGNATURE_EN_COURS',
  GAGNE = 'GAGNE',
  PERDU = 'PERDU',
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
    QUALIFICATION: ['DEVIS_CREE', 'PERDU'],
    DEVIS_CREE: ['DEVIS_EN_CONSIDERATION', 'PERDU'],
    DEVIS_EN_CONSIDERATION: ['NEGOCIATION', 'SIGNATURE_EN_COURS', 'PERDU'],
    NEGOCIATION: ['SIGNATURE_EN_COURS', 'PERDU'],
    SIGNATURE_EN_COURS: ['GAGNE', 'NEGOCIATION', 'PERDU'],
    GAGNE: [],
    PERDU: [],
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
      stage: DealStage.QUALIFICATION,
      stageHistory: [{ stage: DealStage.QUALIFICATION, enteredAt: now }],
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
    if (newStage === DealStage.GAGNE || newStage === DealStage.PERDU) {
      throw new Error(`Use close() to transition to ${newStage}`);
    }
    return new Deal({
      ...this.props,
      stage: newStage,
      stageHistory: [...this.props.stageHistory, { stage: newStage, enteredAt: new Date() }],
      updatedAt: new Date(),
    });
  }

  close(won: boolean, reason: string): Deal {
    const stage = won ? DealStage.GAGNE : DealStage.PERDU;
    const currentAllowed = Deal.VALID_TRANSITIONS[this.props.stage] ?? [];
    if (!currentAllowed.includes(stage)) {
      throw new Error(`Invalid transition: ${this.props.stage} → ${stage}`);
    }
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
