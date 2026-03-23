export class GetPipelineMetricsQuery {
  constructor(
    public readonly dateFrom: Date,
    public readonly dateTo: Date,
    public readonly metricNames?: string[],
  ) {}
}
