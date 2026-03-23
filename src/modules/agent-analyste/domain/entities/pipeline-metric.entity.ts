export interface PipelineMetricProps {
  id: string;
  date: Date;
  metricName: string;
  metricValue: number;
  dimensions: Record<string, unknown>;
  createdAt: Date;
}

export class PipelineMetric {
  private constructor(private readonly props: PipelineMetricProps) {}

  static create(params: Omit<PipelineMetricProps, 'id' | 'createdAt'>): PipelineMetric {
    return new PipelineMetric({
      ...params,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    });
  }

  static reconstitute(props: PipelineMetricProps): PipelineMetric {
    return new PipelineMetric(props);
  }

  get id(): string {
    return this.props.id;
  }
  get date(): Date {
    return this.props.date;
  }
  get metricName(): string {
    return this.props.metricName;
  }
  get metricValue(): number {
    return this.props.metricValue;
  }
  get dimensions(): Record<string, unknown> {
    return { ...this.props.dimensions };
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  toPlainObject(): PipelineMetricProps {
    return { ...this.props, dimensions: { ...this.props.dimensions } };
  }
}
