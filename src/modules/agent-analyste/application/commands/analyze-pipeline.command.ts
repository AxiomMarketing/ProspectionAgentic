export class AnalyzePipelineCommand {
  constructor(
    public readonly dateFrom: Date,
    public readonly dateTo: Date,
    public readonly agentFilter?: string,
  ) {}
}
