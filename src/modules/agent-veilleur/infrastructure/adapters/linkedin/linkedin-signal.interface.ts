export interface LinkedInSignal {
  type:
    | 'job_change'
    | 'headcount_change'
    | 'hiring'
    | 'hiring_velocity'
    | 'funding'
    | 'expansion';
  companyName: string;
  companyLinkedinUrl?: string;
  personName?: string;
  personRole?: string;
  detail: string;
  score: number;
  detectedAt: Date;
}
