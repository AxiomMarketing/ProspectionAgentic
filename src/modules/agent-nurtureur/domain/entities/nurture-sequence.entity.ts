export type NurtureStatus = 'active' | 'paused' | 'reactivated' | 'exited';
export type SequenceType = 'WARM_NURTURE' | 'COLD_NURTURE' | 'PAS_MAINTENANT_NURTURE';
export type ScoringCategorie = 'WARM' | 'COLD';
export type JourneyStage = 'awareness' | 'consideration' | 'decision';

export interface NurtureSequenceProps {
  id: string;
  prospectId: string;
  entryReason: string;
  entryDate: Date;
  status: NurtureStatus;
  reactivatedAt?: Date;
  exitReason?: string;
  tags: string[];

  sequenceType?: SequenceType;
  currentStep: number;
  totalSteps: number;
  segment?: string;
  scoringCategorie?: ScoringCategorie;
  journeyStage: JourneyStage;

  engagementScoreInitial: number;
  engagementScoreCurrent: number;
  lastScoreUpdate?: Date;

  emailsNurtureSent: number;
  emailsOpened: number;
  emailsClicked: number;
  repliesReceived: number;
  contentDownloaded: number;
  consecutiveUnopened: number;

  nextEmailScheduledAt?: Date;
  nextRescoreAt?: Date;
  lastInteractionAt?: Date;
  lastEmailSentAt?: Date;
  inactiveSince?: Date;

  consentBasis: string;
  optOutAt?: Date;
  dataRetentionUntil?: Date;
}

export class NurtureSequence {
  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    active: ['paused', 'exited'],
    paused: ['active', 'exited'],
    reactivated: ['paused', 'exited'],
    exited: [],
  };

  private constructor(private readonly props: NurtureSequenceProps) {}

  static create(prospectId: string, entryReason: string): NurtureSequence {
    return new NurtureSequence({
      id: crypto.randomUUID(),
      prospectId,
      entryReason,
      entryDate: new Date(),
      status: 'active',
      tags: [],
      currentStep: 0,
      totalSteps: 12,
      journeyStage: 'awareness',
      engagementScoreInitial: 0,
      engagementScoreCurrent: 0,
      emailsNurtureSent: 0,
      emailsOpened: 0,
      emailsClicked: 0,
      repliesReceived: 0,
      contentDownloaded: 0,
      consecutiveUnopened: 0,
      consentBasis: 'legitimate_interest',
    });
  }

  static reconstitute(props: NurtureSequenceProps): NurtureSequence {
    return new NurtureSequence(props);
  }

  get id(): string {
    return this.props.id;
  }
  get prospectId(): string {
    return this.props.prospectId;
  }
  get entryReason(): string {
    return this.props.entryReason;
  }
  get entryDate(): Date {
    return this.props.entryDate;
  }
  get status(): NurtureStatus {
    return this.props.status;
  }
  get reactivatedAt(): Date | undefined {
    return this.props.reactivatedAt;
  }
  get exitReason(): string | undefined {
    return this.props.exitReason;
  }
  get tags(): string[] {
    return [...this.props.tags];
  }
  get sequenceType(): SequenceType | undefined {
    return this.props.sequenceType;
  }
  get currentStep(): number {
    return this.props.currentStep;
  }
  get totalSteps(): number {
    return this.props.totalSteps;
  }
  get segment(): string | undefined {
    return this.props.segment;
  }
  get scoringCategorie(): ScoringCategorie | undefined {
    return this.props.scoringCategorie;
  }
  get journeyStage(): JourneyStage {
    return this.props.journeyStage;
  }
  get engagementScoreInitial(): number {
    return this.props.engagementScoreInitial;
  }
  get engagementScoreCurrent(): number {
    return this.props.engagementScoreCurrent;
  }
  get lastScoreUpdate(): Date | undefined {
    return this.props.lastScoreUpdate;
  }
  get emailsNurtureSent(): number {
    return this.props.emailsNurtureSent;
  }
  get emailsOpened(): number {
    return this.props.emailsOpened;
  }
  get emailsClicked(): number {
    return this.props.emailsClicked;
  }
  get repliesReceived(): number {
    return this.props.repliesReceived;
  }
  get contentDownloaded(): number {
    return this.props.contentDownloaded;
  }
  get consecutiveUnopened(): number {
    return this.props.consecutiveUnopened;
  }
  get nextEmailScheduledAt(): Date | undefined {
    return this.props.nextEmailScheduledAt;
  }
  get nextRescoreAt(): Date | undefined {
    return this.props.nextRescoreAt;
  }
  get lastInteractionAt(): Date | undefined {
    return this.props.lastInteractionAt;
  }
  get lastEmailSentAt(): Date | undefined {
    return this.props.lastEmailSentAt;
  }
  get inactiveSince(): Date | undefined {
    return this.props.inactiveSince;
  }
  get consentBasis(): string {
    return this.props.consentBasis;
  }
  get optOutAt(): Date | undefined {
    return this.props.optOutAt;
  }
  get dataRetentionUntil(): Date | undefined {
    return this.props.dataRetentionUntil;
  }

  exit(reason: string): NurtureSequence {
    if (this.props.status === 'exited') {
      throw new Error(`Cannot exit a sequence that is already exited`);
    }
    const allowed = NurtureSequence.VALID_TRANSITIONS[this.props.status];
    if (!allowed.includes('exited')) {
      throw new Error(`Transition from ${this.props.status} to exited is not allowed`);
    }
    return new NurtureSequence({ ...this.props, status: 'exited', exitReason: reason });
  }

  pause(): NurtureSequence {
    if (this.props.status !== 'active' && this.props.status !== 'reactivated') {
      throw new Error(`Cannot pause a sequence with status ${this.props.status}`);
    }
    const allowed = NurtureSequence.VALID_TRANSITIONS[this.props.status];
    if (!allowed.includes('paused')) {
      throw new Error(`Transition from ${this.props.status} to paused is not allowed`);
    }
    return new NurtureSequence({ ...this.props, status: 'paused' });
  }

  reactivate(): NurtureSequence {
    return new NurtureSequence({ ...this.props, status: 'reactivated', reactivatedAt: new Date() });
  }

  incrementStep(): NurtureSequence {
    return new NurtureSequence({
      ...this.props,
      currentStep: Math.min(this.props.currentStep + 1, this.props.totalSteps),
    });
  }

  updateEngagement(delta: number): NurtureSequence {
    return new NurtureSequence({
      ...this.props,
      engagementScoreCurrent: this.props.engagementScoreCurrent + delta,
      lastScoreUpdate: new Date(),
    });
  }

  recordEmailSent(): NurtureSequence {
    return new NurtureSequence({
      ...this.props,
      emailsNurtureSent: this.props.emailsNurtureSent + 1,
      lastEmailSentAt: new Date(),
      lastInteractionAt: new Date(),
    });
  }

  recordOpen(): NurtureSequence {
    return new NurtureSequence({
      ...this.props,
      emailsOpened: this.props.emailsOpened + 1,
      consecutiveUnopened: 0,
      lastInteractionAt: new Date(),
    });
  }

  recordClick(): NurtureSequence {
    return new NurtureSequence({
      ...this.props,
      emailsClicked: this.props.emailsClicked + 1,
      lastInteractionAt: new Date(),
    });
  }

  addReason(reason: string): NurtureSequence {
    return new NurtureSequence({
      ...this.props,
      entryReason: this.props.entryReason
        ? `${this.props.entryReason}; ${reason}`
        : reason,
    });
  }

  upgradeCategory(newCategory: ScoringCategorie): NurtureSequence {
    return new NurtureSequence({ ...this.props, scoringCategorie: newCategory });
  }

  toPlainObject(): NurtureSequenceProps {
    return {
      ...this.props,
      tags: [...this.props.tags],
    };
  }
}
