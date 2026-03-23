export type ProspectStatus =
  | 'raw'
  | 'enriched'
  | 'scored'
  | 'contacted'
  | 'replied'
  | 'meeting_booked'
  | 'deal_in_progress'
  | 'won'
  | 'lost'
  | 'nurturing'
  | 'blacklisted'
  | 'unsubscribed';

export interface ProspectProps {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  linkedinUrl?: string;
  companyName?: string;
  companySiren?: string;
  companySize?: string;
  companyWebsite?: string;
  jobTitle?: string;
  seniorityLevel?: string;
  isDecisionMaker: boolean;
  status: ProspectStatus;
  enrichmentData?: Record<string, unknown>;
  enrichedAt?: Date;
  consentGiven: boolean;
  consentDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class Prospect {
  private constructor(private readonly props: ProspectProps) {}

  static create(
    params: Omit<ProspectProps, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'emailVerified' | 'isDecisionMaker' | 'consentGiven'>,
  ): Prospect {
    return new Prospect({
      id: crypto.randomUUID(),
      emailVerified: false,
      isDecisionMaker: false,
      status: 'raw',
      consentGiven: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...params,
    });
  }

  static reconstitute(props: ProspectProps): Prospect {
    return new Prospect(props);
  }

  get id(): string { return this.props.id; }
  get email(): string | undefined { return this.props.email; }
  get companyName(): string | undefined { return this.props.companyName; }
  get status(): ProspectStatus { return this.props.status; }
  get fullName(): string | undefined { return this.props.fullName; }
  get createdAt(): Date { return this.props.createdAt; }

  updateStatus(status: ProspectStatus): Prospect {
    return new Prospect({ ...this.props, status, updatedAt: new Date() });
  }

  enrich(data: Record<string, unknown>): Prospect {
    return new Prospect({
      ...this.props,
      enrichmentData: { ...this.props.enrichmentData, ...data },
      enrichedAt: new Date(),
      status: 'enriched',
      updatedAt: new Date(),
    });
  }

  toPlainObject(): ProspectProps { return { ...this.props }; }
}
