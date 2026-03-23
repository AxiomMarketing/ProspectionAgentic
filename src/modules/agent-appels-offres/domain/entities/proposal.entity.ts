export type ProposalStatus = 'draft' | 'submitted' | 'won' | 'lost';

export interface ProposalProps {
  id: string;
  tenderId: string;
  status: ProposalStatus;
  submittedAt?: Date;
  createdAt: Date;
}

export class Proposal {
  private constructor(private readonly props: ProposalProps) {}

  static create(tenderId: string): Proposal {
    return new Proposal({
      id: crypto.randomUUID(),
      tenderId,
      status: 'draft',
      createdAt: new Date(),
    });
  }

  static reconstitute(props: ProposalProps): Proposal {
    return new Proposal(props);
  }

  get id(): string {
    return this.props.id;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get status(): ProposalStatus {
    return this.props.status;
  }
  get submittedAt(): Date | undefined {
    return this.props.submittedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  submit(): Proposal {
    return new Proposal({ ...this.props, status: 'submitted', submittedAt: new Date() });
  }

  toPlainObject(): ProposalProps {
    return { ...this.props };
  }
}
