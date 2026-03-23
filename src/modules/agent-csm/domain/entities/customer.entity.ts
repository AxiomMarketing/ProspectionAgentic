export type CustomerStatus = 'active' | 'churned' | 'suspended';

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
}

export class Customer {
  private constructor(private readonly props: CustomerProps) {}

  static create(
    params: Pick<
      CustomerProps,
      'companyName' | 'siren' | 'primaryContactId' | 'contractStartDate' | 'mrrEur' | 'plan'
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
