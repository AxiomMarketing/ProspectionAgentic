export class AnalyzeTenderCommand {
  constructor(
    public readonly tenderId: string,
    public readonly forceReanalyze: boolean = false,
  ) {}
}
