export interface HealthScoreProps {
  id: string;
  customerId: string;
  healthScore: number;
  healthLabel?: string;
  usageScore?: number;
  supportScore?: number;
  financialScore?: number;
  engagementScore?: number;
  npsScore?: number;
  signals: Record<string, unknown>;
  isLatest: boolean;
  calculatedAt: Date;
}

export class HealthScore {
  private constructor(private readonly props: HealthScoreProps) {}

  static create(params: Omit<HealthScoreProps, 'id' | 'isLatest' | 'calculatedAt'>): HealthScore {
    return new HealthScore({
      ...params,
      id: crypto.randomUUID(),
      isLatest: true,
      calculatedAt: new Date(),
    });
  }

  static reconstitute(props: HealthScoreProps): HealthScore {
    return new HealthScore(props);
  }

  get id(): string {
    return this.props.id;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get healthScore(): number {
    return this.props.healthScore;
  }
  get healthLabel(): string | undefined {
    return this.props.healthLabel;
  }
  get usageScore(): number | undefined {
    return this.props.usageScore;
  }
  get supportScore(): number | undefined {
    return this.props.supportScore;
  }
  get financialScore(): number | undefined {
    return this.props.financialScore;
  }
  get engagementScore(): number | undefined {
    return this.props.engagementScore;
  }
  get npsScore(): number | undefined {
    return this.props.npsScore;
  }
  get signals(): Record<string, unknown> {
    return { ...this.props.signals };
  }
  get isLatest(): boolean {
    return this.props.isLatest;
  }
  get calculatedAt(): Date {
    return this.props.calculatedAt;
  }

  supercede(): HealthScore {
    return new HealthScore({ ...this.props, isLatest: false });
  }

  toPlainObject(): HealthScoreProps {
    return { ...this.props, signals: { ...this.props.signals } };
  }
}
