export class GetTenderAnalysisQuery {
  constructor(
    public readonly tenderId: string,
    public readonly includeHistory: boolean = false,
  ) {}
}
