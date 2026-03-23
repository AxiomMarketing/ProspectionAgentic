export interface ProspectScoreProps {
  id: string;
  prospectId: string;
  totalScore: number;
  firmographicScore: number;
  technographicScore: number;
  behavioralScore: number;
  engagementScore: number;
  intentScore: number;
  accessibilityScore: number;
  segment: string;
  isLatest: boolean;
  modelVersion: string;
  calculatedAt: Date;
}

export class ProspectScore {
  private constructor(private readonly props: ProspectScoreProps) {}

  static create(params: Omit<ProspectScoreProps, 'id' | 'calculatedAt'>): ProspectScore {
    return new ProspectScore({
      ...params,
      id: crypto.randomUUID(),
      calculatedAt: new Date(),
    });
  }

  static reconstitute(props: ProspectScoreProps): ProspectScore {
    return new ProspectScore(props);
  }

  get id(): string {
    return this.props.id;
  }
  get prospectId(): string {
    return this.props.prospectId;
  }
  get totalScore(): number {
    return this.props.totalScore;
  }
  get firmographicScore(): number {
    return this.props.firmographicScore;
  }
  get technographicScore(): number {
    return this.props.technographicScore;
  }
  get behavioralScore(): number {
    return this.props.behavioralScore;
  }
  get engagementScore(): number {
    return this.props.engagementScore;
  }
  get intentScore(): number {
    return this.props.intentScore;
  }
  get accessibilityScore(): number {
    return this.props.accessibilityScore;
  }
  get segment(): string {
    return this.props.segment;
  }
  get isLatest(): boolean {
    return this.props.isLatest;
  }
  get modelVersion(): string {
    return this.props.modelVersion;
  }
  get calculatedAt(): Date {
    return this.props.calculatedAt;
  }

  toPlainObject(): ProspectScoreProps {
    return { ...this.props };
  }
}
