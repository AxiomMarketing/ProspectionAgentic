import { Injectable } from '@nestjs/common';

// Segment coefficient multipliers
export const SEGMENT_COEFFICIENTS: Record<string, Record<string, number>> = {
  pme_metro: { icp: 1.0, signaux: 1.2, technique: 0.8, engagement: 0.9 },
  ecommerce: { icp: 0.9, signaux: 1.0, technique: 1.3, engagement: 1.1 },
  collectivite: { icp: 1.1, signaux: 0.9, technique: 0.9, engagement: 1.0 },
  startup: { icp: 0.8, signaux: 1.4, technique: 1.1, engagement: 1.2 },
  agence_wl: { icp: 1.0, signaux: 1.1, technique: 1.2, engagement: 1.0 },
};

export const DEFAULT_COEFFICIENTS = { icp: 1.0, signaux: 1.0, technique: 1.0, engagement: 1.0 };

export type ScoreCategory = 'HOT_A' | 'HOT_B' | 'HOT_C' | 'WARM' | 'COLD' | 'DISQUALIFIE';

export interface ScoringInput {
  // ICP Fit data
  companySize?: string;
  industry?: string;
  region?: string;
  // Signals
  signals: Array<{ type: string; date: Date; source: string }>;
  // Technical
  lighthouseScore?: number;
  hasModernFramework?: boolean;
  hasMobileOptimization?: boolean;
  hasSecurityCerts?: boolean;
  // Engagement
  emailVerified?: boolean;
  phoneAvailable?: boolean;
  hasLinkedinProfile?: boolean;
  websiteTraffic?: number;
  // Metadata
  segment?: string;
  isCompetitor?: boolean;
  isOptedOut?: boolean;
  isRgpdBlocked?: boolean;
  isBankrupt?: boolean;
  emailInvalid?: boolean;
}

export interface ScoringResult {
  totalScore: number;
  category: ScoreCategory;
  breakdown: {
    icpFit: number;
    icpFitNormalized: number;
    signalsIntention: number;
    signalsIntentionNormalized: number;
    stackTechnique: number;
    stackTechniqueNormalized: number;
    engagement: number;
    engagementNormalized: number;
    malusTotal: number;
    bonusTotal: number;
    rawScore: number;
  };
  routing: {
    sequenceId: string;
    canal: string;
    slaHours: number;
    priority: number;
    delayMs: number;
  };
}

@Injectable()
export class ScoringEngine {
  calculate(input: ScoringInput): ScoringResult {
    // 1. Check hard disqualifications
    const hardMalus = this.checkHardDisqualifications(input);
    if (hardMalus === -100) {
      return this.buildDisqualifiedResult(input);
    }

    // 2. Calculate 4 axes
    const icpFit = this.calculateICPFit(input); // max 35
    const signaux = this.calculateSignals(input); // max 30
    const technique = this.calculateTechnique(input); // max 20
    const engagement = this.calculateEngagement(input); // max 15

    // 3. Apply segment coefficients
    const coefs = SEGMENT_COEFFICIENTS[input.segment ?? ''] ?? DEFAULT_COEFFICIENTS;
    const icpNorm = icpFit * coefs.icp;
    const signauxNorm = signaux * coefs.signaux;
    const techniqueNorm = technique * coefs.technique;
    const engagementNorm = engagement * coefs.engagement;

    // 4. Calculate malus and bonus
    const softMalus = this.calculateSoftMalus(input);
    const bonus = this.calculateBonus(input);

    // 5. Raw and normalized score
    const rawScore = icpNorm + signauxNorm + techniqueNorm + engagementNorm + softMalus + bonus;
    const totalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    // 6. Categorize
    const category = this.categorize(totalScore);

    // 7. Determine routing
    const routing = this.determineRouting(category);

    return {
      totalScore,
      category,
      breakdown: {
        icpFit,
        icpFitNormalized: Math.round(icpNorm * 10) / 10,
        signalsIntention: signaux,
        signalsIntentionNormalized: Math.round(signauxNorm * 10) / 10,
        stackTechnique: technique,
        stackTechniqueNormalized: Math.round(techniqueNorm * 10) / 10,
        engagement,
        engagementNormalized: Math.round(engagementNorm * 10) / 10,
        malusTotal: softMalus,
        bonusTotal: bonus,
        rawScore: Math.round(rawScore * 10) / 10,
      },
      routing,
    };
  }

  private calculateICPFit(input: ScoringInput): number {
    let score = 0;
    // Company size (max 15)
    const sizeMap: Record<string, number> = {
      '11-50': 15,
      '51-200': 12,
      '201-500': 8,
      '1-10': 5,
      '501-1000': 3,
      '1000+': 0,
    };
    score += sizeMap[input.companySize ?? ''] ?? 5;
    // Industry (max 10)
    const priorityIndustries = [
      'informatique',
      'e-commerce',
      'marketing',
      'digital',
      'web',
      'saas',
    ];
    if (input.industry && priorityIndustries.some((i) => input.industry!.toLowerCase().includes(i)))
      score += 10;
    else if (input.industry) score += 3;
    // Geography (max 10) — default France
    const regionMap: Record<string, number> = {
      'ile-de-france': 10,
      provence: 10,
      auvergne: 8,
      occitanie: 8,
      'nouvelle-aquitaine': 7,
    };
    score += regionMap[input.region?.toLowerCase() ?? ''] ?? 5;
    return Math.min(35, score);
  }

  private calculateSignals(input: ScoringInput): number {
    if (!input.signals || input.signals.length === 0) return 0;
    const SIGNAL_CONFIG: Record<string, { base: number; halfLife: number }> = {
      funding_round: { base: 22, halfLife: 180 },
      job_posting: { base: 12, halfLife: 60 },
      changement_poste: { base: 15, halfLife: 90 },
      recrutement_dev_web: { base: 14, halfLife: 60 },
      news_mention: { base: 10, halfLife: 90 },
      technology_adoption: { base: 14, halfLife: 45 },
      expansion: { base: 16, halfLife: 120 },
      website_update: { base: 8, halfLife: 30 },
      form_submission: { base: 25, halfLife: 14 },
      email_click: { base: 15, halfLife: 10 },
    };
    let totalSignalScore = 0;
    // Sort by date (most recent first) and apply rank multiplier
    const sorted = [...input.signals].sort((a, b) => b.date.getTime() - a.date.getTime());
    sorted.forEach((signal, index) => {
      const config = SIGNAL_CONFIG[signal.type] ?? { base: 8, halfLife: 30 };
      const daysElapsed = (Date.now() - signal.date.getTime()) / (1000 * 60 * 60 * 24);
      const decayed = config.base * Math.pow(0.5, daysElapsed / config.halfLife);
      const rankMultiplier = [1.0, 0.5, 0.25, 0.1][Math.min(index, 3)];
      totalSignalScore += decayed * rankMultiplier;
    });
    // Multi-source bonus
    const sources = new Set(input.signals.map((s) => s.source));
    if (sources.size >= 3) totalSignalScore += 5;
    else if (sources.size >= 2) totalSignalScore += 3;
    return Math.min(30, Math.round(totalSignalScore));
  }

  private calculateTechnique(input: ScoringInput): number {
    let score = 0;
    if (input.hasModernFramework) score += 8;
    if (input.hasMobileOptimization) score += 6;
    if (input.hasSecurityCerts) score += 3;
    if (input.lighthouseScore && input.lighthouseScore >= 80) score += 3;
    return Math.min(20, score);
  }

  private calculateEngagement(input: ScoringInput): number {
    let score = 0;
    if (input.emailVerified) score += 3;
    if (input.phoneAvailable) score += 3;
    if (input.hasLinkedinProfile) score += 4;
    if (input.emailVerified && input.phoneAvailable) score += 3; // Both verified bonus
    if (input.websiteTraffic && input.websiteTraffic >= 1000) score += 2;
    return Math.min(15, score);
  }

  private checkHardDisqualifications(input: ScoringInput): number {
    if (input.isCompetitor) return -100;
    if (input.isOptedOut) return -100;
    if (input.isRgpdBlocked) return -100;
    if (input.emailInvalid) return -100;
    if (input.isBankrupt) return -100;
    return 0;
  }

  private calculateSoftMalus(input: ScoringInput): number {
    let malus = 0;
    if (!input.emailVerified) malus -= 5;
    if (!input.emailVerified && !input.phoneAvailable && !input.hasLinkedinProfile) malus -= 10;
    if (!input.hasModernFramework && !input.lighthouseScore) malus -= 8;
    // Signal freshness — all signals older than 60 days
    if (input.signals.length > 0) {
      const allOld = input.signals.every(
        (s) => Date.now() - s.date.getTime() > 60 * 24 * 60 * 60 * 1000,
      );
      if (allOld) malus -= 15;
    }
    return malus;
  }

  private calculateBonus(input: ScoringInput): number {
    let bonus = 0;
    if (input.emailVerified && input.phoneAvailable) bonus += 5;
    // Recent signal bonus
    if (input.signals.some((s) => Date.now() - s.date.getTime() < 7 * 24 * 60 * 60 * 1000))
      bonus += 8;
    return bonus;
  }

  private categorize(score: number): ScoreCategory {
    if (score >= 90) return 'HOT_A';
    if (score >= 80) return 'HOT_B';
    if (score >= 75) return 'HOT_C';
    if (score >= 50) return 'WARM';
    if (score >= 25) return 'COLD';
    return 'DISQUALIFIE';
  }

  private determineRouting(category: ScoreCategory): ScoringResult['routing'] {
    const ROUTING: Record<ScoreCategory, ScoringResult['routing']> = {
      HOT_A: {
        sequenceId: 'seq_hot_a_vip',
        canal: 'email',
        slaHours: 1,
        priority: 100,
        delayMs: 0,
      },
      HOT_B: {
        sequenceId: 'seq_hot_b_standard',
        canal: 'email',
        slaHours: 4,
        priority: 75,
        delayMs: 300_000,
      },
      HOT_C: {
        sequenceId: 'seq_hot_c_nurture',
        canal: 'email',
        slaHours: 8,
        priority: 50,
        delayMs: 3_600_000,
      },
      WARM: {
        sequenceId: 'seq_warm_nurture',
        canal: 'email',
        slaHours: 0,
        priority: 25,
        delayMs: 86_400_000,
      },
      COLD: {
        sequenceId: 'seq_cold_newsletter',
        canal: 'email',
        slaHours: 0,
        priority: 10,
        delayMs: 604_800_000,
      },
      DISQUALIFIE: { sequenceId: 'none', canal: 'none', slaHours: 0, priority: 0, delayMs: 0 },
    };
    return ROUTING[category];
  }

  private buildDisqualifiedResult(_input: ScoringInput): ScoringResult {
    return {
      totalScore: 0,
      category: 'DISQUALIFIE',
      breakdown: {
        icpFit: 0,
        icpFitNormalized: 0,
        signalsIntention: 0,
        signalsIntentionNormalized: 0,
        stackTechnique: 0,
        stackTechniqueNormalized: 0,
        engagement: 0,
        engagementNormalized: 0,
        malusTotal: -100,
        bonusTotal: 0,
        rawScore: -100,
      },
      routing: { sequenceId: 'none', canal: 'none', slaHours: 0, priority: 0, delayMs: 0 },
    };
  }
}
