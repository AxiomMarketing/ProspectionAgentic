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

/** Matches the MetriquesDaily Prisma model (60+ columns). */
export interface DailySnapshot {
  id: string;
  dateSnapshot: Date;

  // Veilleur
  veilleurLeadsBruts: number;
  veilleurLeadsLinkedin: number;
  veilleurLeadsMarches: number;
  veilleurLeadsWeb: number;
  veilleurLeadsJobboards: number;
  veilleurLeadsQualifies: number;
  veilleurPreScoreMoyen: number;
  veilleurTauxDeduplication: number;
  veilleurCoutApiEur: number;

  // Enrichisseur
  enrichisseurProspectsTraites: number;
  enrichisseurEmailsTrouves: number;
  enrichisseurEmailsNonTrouves: number;
  enrichisseurTauxEnrichissement: number;
  enrichisseurTauxEmailValide: number;
  enrichisseurTempsMoyenMs: number;
  enrichisseurCoutApiEur: number;

  // Scoreur
  scoreurProspectsScores: number;
  scoreurNbHot: number;
  scoreurNbWarm: number;
  scoreurNbCold: number;
  scoreurNbDisqualifie: number;
  scoreurScoreMoyen: number;
  scoreurPctHot: number;
  scoreurPctWarm: number;
  scoreurPctCold: number;
  scoreurPctDisqualifie: number;
  scoreurReclassifications: number;

  // Redacteur
  redacteurMessagesGeneres: number;
  redacteurCoutGenerationEur: number;
  redacteurTempsMoyenGenerationMs: number;
  redacteurTemplatesActifs: number;
  redacteurAbTestsEnCours: number;

  // Suiveur
  suiveurEmailsEnvoyes: number;
  suiveurLinkedinConnections: number;
  suiveurLinkedinMessages: number;
  suiveurEmailsBounced: number;
  suiveurBounceRate: number;
  suiveurReponsesTotal: number;
  suiveurReponsesPositives: number;
  suiveurReponsesNegatives: number;
  suiveurReponsesPasMaintenant: number;
  suiveurReplyRate: number;
  suiveurPositiveReplyRate: number;
  suiveurSequencesActives: number;
  suiveurSequencesCompletees: number;
  suiveurSlaBreaches: number;
  suiveurOptOuts: number;
  suiveurCoutEur: number;

  // Nurtureur
  nurtureurTotalEnNurture: number;
  nurtureurNouveauxEntres: number;
  nurtureurEmailsNurtureEnvoyes: number;
  nurtureurTauxOuverture: number;
  nurtureurTauxClic: number;
  nurtureurReclassifiesHot: number;
  nurtureurSunset: number;
  nurtureurOptOuts: number;
  nurtureurEngagementScoreMoyen: number;
  nurtureurCoutEur: number;

  // Pipeline
  pipelineLeadsGeneres: number;
  pipelineProspectsContactes: number;
  pipelineReponsesPositives: number;
  pipelineRdvBookes: number;
  pipelinePropositionsEnvoyees: number;
  pipelineDealsGagnes: number;
  pipelineDealsPerdus: number;
  pipelineRevenuJour: number;
  pipelineValeurTotale: number;
  pipelineVelocityJour: number;

  // Couts
  coutTotalJourEur: number;
  coutClaudeApiEur: number;
  coutApisExternesEur: number;
  coutInfrastructureEur: number;

  snapshotVersion: string;
  createdAt: Date;
}
