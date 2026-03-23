export type NurtureStatus = 'active' | 'paused' | 'reactivated' | 'exited';

export interface NurtureSequenceProps {
  id: string;
  prospectId: string;
  entryReason: string;
  entryDate: Date;
  status: NurtureStatus;
  reactivatedAt?: Date;
  exitReason?: string;
  tags: string[];
}

export class NurtureSequence {
  private constructor(private readonly props: NurtureSequenceProps) {}

  static create(prospectId: string, entryReason: string): NurtureSequence {
    return new NurtureSequence({
      id: crypto.randomUUID(),
      prospectId,
      entryReason,
      entryDate: new Date(),
      status: 'active',
      tags: [],
    });
  }

  static reconstitute(props: NurtureSequenceProps): NurtureSequence {
    return new NurtureSequence(props);
  }

  get id(): string { return this.props.id; }
  get prospectId(): string { return this.props.prospectId; }
  get entryReason(): string { return this.props.entryReason; }
  get entryDate(): Date { return this.props.entryDate; }
  get status(): NurtureStatus { return this.props.status; }
  get reactivatedAt(): Date | undefined { return this.props.reactivatedAt; }
  get exitReason(): string | undefined { return this.props.exitReason; }
  get tags(): string[] { return [...this.props.tags]; }

  pause(): NurtureSequence {
    return new NurtureSequence({ ...this.props, status: 'paused' });
  }

  reactivate(): NurtureSequence {
    return new NurtureSequence({ ...this.props, status: 'reactivated', reactivatedAt: new Date() });
  }

  exit(reason: string): NurtureSequence {
    return new NurtureSequence({ ...this.props, status: 'exited', exitReason: reason });
  }

  toPlainObject(): NurtureSequenceProps { return { ...this.props, tags: [...this.props.tags] }; }
}
