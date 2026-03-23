export interface ScoringCoefficientWeights {
  firmographic: number;
  technographic: number;
  behavioral: number;
  engagement: number;
  intent: number;
}

export interface ScoringCoefficientProps {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  coefficients: ScoringCoefficientWeights;
}

export class ScoringCoefficient {
  private constructor(private readonly props: ScoringCoefficientProps) {}

  static create(params: Omit<ScoringCoefficientProps, 'id'>): ScoringCoefficient {
    return new ScoringCoefficient({
      ...params,
      id: crypto.randomUUID(),
    });
  }

  static reconstitute(props: ScoringCoefficientProps): ScoringCoefficient {
    return new ScoringCoefficient(props);
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get version(): string { return this.props.version; }
  get isActive(): boolean { return this.props.isActive; }
  get coefficients(): ScoringCoefficientWeights { return this.props.coefficients; }

  toPlainObject(): ScoringCoefficientProps { return { ...this.props }; }
}
