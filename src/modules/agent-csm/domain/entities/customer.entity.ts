// status allowed values: 'active' | 'churned' | 'suspended' | 'onboarding'
export type CustomerStatus = 'active' | 'churned' | 'suspended' | 'onboarding';

export interface CustomerProps {
  id: string;
  companyName: string;
  siren?: string;
  primaryContactId?: string;
  contractStartDate?: Date;
  mrrEur: number;
  plan?: string;
  status: CustomerStatus;
  churnedAt?: Date;
  churnReason?: string;
  createdAt: Date;
  updatedAt: Date;
  typeProjet?: string;           // 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
  tier?: string;                 // 'bronze' | 'silver' | 'gold'
  scopeDetaille?: string[];      // contractual scope items
  conditionsPaiement?: string;   // '50/50' | '30/40/30' | 'mensuel'
  notesVente?: string;           // sales notes from DealToCSM
  dealCycleDays?: number;        // sales cycle length in days
  engagementScoreFinal?: number; // engagement score at closing time
}

export class Customer {
  private constructor(private readonly props: CustomerProps) {}

  static create(
    params: Pick<
      CustomerProps,
      | 'companyName'
      | 'siren'
      | 'primaryContactId'
      | 'contractStartDate'
      | 'mrrEur'
      | 'plan'
      | 'typeProjet'
      | 'tier'
      | 'scopeDetaille'
      | 'conditionsPaiement'
      | 'notesVente'
      | 'dealCycleDays'
      | 'engagementScoreFinal'
    >,
  ): Customer {
    const now = new Date();
    return new Customer({
      ...params,
      id: crypto.randomUUID(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: CustomerProps): Customer {
    return new Customer(props);
  }

  get id(): string {
    return this.props.id;
  }
  get companyName(): string {
    return this.props.companyName;
  }
  get siren(): string | undefined {
    return this.props.siren;
  }
  get primaryContactId(): string | undefined {
    return this.props.primaryContactId;
  }
  get contractStartDate(): Date | undefined {
    return this.props.contractStartDate;
  }
  get mrrEur(): number {
    return this.props.mrrEur;
  }
  get plan(): string | undefined {
    return this.props.plan;
  }
  get status(): CustomerStatus {
    return this.props.status;
  }
  get churnedAt(): Date | undefined {
    return this.props.churnedAt;
  }
  get churnReason(): string | undefined {
    return this.props.churnReason;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get typeProjet(): string | undefined {
    return this.props.typeProjet;
  }
  get tier(): string | undefined {
    return this.props.tier;
  }
  get scopeDetaille(): string[] | undefined {
    return this.props.scopeDetaille;
  }
  get conditionsPaiement(): string | undefined {
    return this.props.conditionsPaiement;
  }
  get notesVente(): string | undefined {
    return this.props.notesVente;
  }
  get dealCycleDays(): number | undefined {
    return this.props.dealCycleDays;
  }
  get engagementScoreFinal(): number | undefined {
    return this.props.engagementScoreFinal;
  }

  churn(reason: string): Customer {
    return new Customer({
      ...this.props,
      status: 'churned',
      churnedAt: new Date(),
      churnReason: reason,
      updatedAt: new Date(),
    });
  }

  reactivate(): Customer {
    return new Customer({
      ...this.props,
      status: 'active',
      churnedAt: undefined,
      churnReason: undefined,
      updatedAt: new Date(),
    });
  }

  toPlainObject(): CustomerProps {
    return { ...this.props };
  }
}
