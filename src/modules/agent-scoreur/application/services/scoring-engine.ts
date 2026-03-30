import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Segment coefficient multipliers — aligned with spec
export const SEGMENT_COEFFICIENTS: Record<string, Record<string, number>> = {
  pme_metro: { icp: 1.0, signaux: 1.0, technique: 1.0, engagement: 1.0 },
  ecommerce: { icp: 0.85, signaux: 1.0, technique: 1.15, engagement: 1.1 },
  collectivite: { icp: 1.2, signaux: 0.9, technique: 1.1, engagement: 0.7 },
  startup: { icp: 0.8, signaux: 1.2, technique: 0.9, engagement: 1.2 },
  agence_wl: { icp: 0.9, signaux: 1.0, technique: 1.1, engagement: 1.1 },
};

export const DEFAULT_COEFFICIENTS = { icp: 1.0, signaux: 1.0, technique: 1.0, engagement: 1.0 };

export type ScoreCategory = 'HOT_A' | 'HOT_B' | 'HOT_C' | 'WARM' | 'COLD' | 'DISQUALIFIE';

export interface ScoringInput {
  // ICP Fit data
  companySize?: string;
  industry?: string;
  nafCode?: string;
  region?: string;
  jobTitle?: string;
  // Signals
  signals: Array<{ type: string; date: Date; source: string }>;
  // Technical
  lighthouseScore?: number;
  hasModernFramework?: boolean;
  hasMobileOptimization?: boolean;
  hasSecurityCerts?: boolean;
  stackObsolete?: boolean;
  rgaaViolationsCritical?: number;
  rgaaCompliant?: boolean;
  // Engagement
  emailVerified?: boolean;
  phoneAvailable?: boolean;
  hasLinkedinProfile?: boolean;
  websiteTraffic?: number;
  // Financial / enrichment
  caAnnuel?: number;
  croissanceCaPct?: number;
  effectifEnBaisse?: boolean;
  emailCatchAll?: boolean;
  emailPersonnel?: boolean;
  decideurIdentifie?: boolean;
  completudePct?: number;
  bodaccNegatif?: boolean;
  // Segment bonuses
  ecommercePlatform?: string;
  hasAppelOffre?: boolean;
  isReferral?: boolean;
  // Metadata
  segment?: string;
  isCompetitor?: boolean;
  isOptedOut?: boolean;
  isRgpdBlocked?: boolean;
  isBankrupt?: boolean;
  emailInvalid?: boolean;
  entrepriseFermee?: boolean;
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

// NAF code scoring map
const NAF_SCORING: Record<string, number> = {
  '6201Z': 10,
  '6202A': 10,
  '7311Z': 8,
  '7312Z': 8,
  '6209Z': 7,
  '7410Z': 6,
  '7021Z': 5,
  '6311Z': 9,
  '6312Z': 9,
};

@Injectable()
export class ScoringEngine {
  constructor(@Optional() private readonly configService?: ConfigService) {}

  private getThreshold(key: string, defaultValue: number): number {
    return this.configService?.get<number>(key) ?? defaultValue;
  }

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

  // Handles INSEE French format (e.g. "10 à 19 salariés") and English ranges (e.g. "11-50")
  parseCompanySize(size: string): number {
    const s = size.toLowerCase().trim();

    // English ranges
    if (s === '11-50') return 10;
    if (s === '51-200') return 8;
    if (s === '201-500') return 6;
    if (s === '1-10') return 4;
    if (s === '501-1000') return 2;
    if (s === '1000+') return 0;

    // INSEE French formats
    if (
      s.includes('10 à 19') ||
      s.includes('10 a 19') ||
      s.includes('20 à 49') ||
      s.includes('20 a 49')
    )
      return 10;
    if (
      s.includes('50 à 99') ||
      s.includes('50 a 99') ||
      s.includes('100 à 199') ||
      s.includes('100 a 199') ||
      s.includes('200 à 249') ||
      s.includes('200 a 249')
    )
      return 8;
    if (
      s.includes('250 à 499') ||
      s.includes('250 a 499') ||
      s.includes('500 à 999') ||
      s.includes('500 a 999')
    )
      return 6;
    if (
      s.includes('1 à 9') ||
      s.includes('1 a 9') ||
      s.includes('0 salarié') ||
      s.includes('sans salarié')
    )
      return 4;
    if (
      s.includes('1 000') ||
      s.includes('5 000') ||
      s.includes('10 000') ||
      (s.includes('1000') && !s.includes('1-1000')) ||
      s.includes('5000') ||
      s.includes('10000')
    )
      return 0;

    return 4; // default
  }

  private calculateICPFit(input: ScoringInput): number {
    // Sub-axis a: Taille (max 10)
    const tailleScore = this.parseCompanySize(input.companySize ?? '');

    // Sub-axis b: Secteur/NAF (max 10)
    let secteurScore = 0;
    if (input.nafCode && NAF_SCORING[input.nafCode] !== undefined) {
      secteurScore = NAF_SCORING[input.nafCode];
    } else if (input.industry) {
      const ind = input.industry.toLowerCase();
      const priorityKeywords = ['informatique', 'e-commerce', 'marketing', 'digital', 'web', 'saas'];
      if (priorityKeywords.some((k) => ind.includes(k))) secteurScore = 10;
      else secteurScore = 3;
    }

    // Sub-axis c: Localisation (max 8)
    let localisationScore = 5;
    const region = input.region?.toLowerCase() ?? '';
    if (region.includes('réunion') || region.includes('reunion') || region === 'dom-tom') {
      localisationScore = 8;
    } else if (region === 'ile-de-france') {
      localisationScore = 7;
    } else if (region === 'provence' || region.includes('paca')) {
      localisationScore = 7;
    } else if (region === 'auvergne' || region === 'occitanie') {
      localisationScore = 6;
    } else if (region === 'nouvelle-aquitaine') {
      localisationScore = 5;
    } else if (region) {
      localisationScore = 4;
    }

    // Sub-axis d: Décideur (max 7)
    let decideurScore = 0;
    if (input.jobTitle) {
      const title = input.jobTitle.toLowerCase();
      if (/\b(ceo|cto|coo|cfo|ciso|dg|pdg|directeur général|directeur general|president)\b/.test(title)) {
        decideurScore = 7;
      } else if (/\b(vp|vice.?president|head of|chief)\b/.test(title)) {
        decideurScore = 5;
      } else if (/\b(manager|responsable|lead|directeur)\b/.test(title)) {
        decideurScore = 3;
      } else {
        decideurScore = 0;
      }
    }

    const total = tailleScore + secteurScore + localisationScore + decideurScore;
    return Math.min(35, total);
  }

  private calculateSignals(input: ScoringInput): number {
    if (!input.signals || input.signals.length === 0) return 0;
    const SIGNAL_CONFIG: Record<string, { base: number; halfLife: number }> = {
      levee_fonds: { base: 30, halfLife: 45 },
      job_posting: { base: 12, halfLife: 60 },
      changement_poste: { base: 15, halfLife: 60 },
      recrutement_dev_web: { base: 14, halfLife: 60 },
      news_mention: { base: 10, halfLife: 90 },
      technology_adoption: { base: 14, halfLife: 45 },
      expansion: { base: 16, halfLife: 120 },
      website_update: { base: 8, halfLife: 30 },
      form_submission: { base: 25, halfLife: 14 },
      email_click: { base: 15, halfLife: 10 },
      marche_public: { base: 25, halfLife: 30 },
      croissance_equipe: { base: 18, halfLife: 60 },
      post_besoin_tech: { base: 20, halfLife: 30 },
      accessibilite_faible: { base: 15, halfLife: 90 },
      tech_obsolete: { base: 15, halfLife: 60 },
      creation_etablissement: { base: 12, halfLife: 120 },
      cession_parts: { base: 10, halfLife: 90 },
      modification_statuts: { base: 8, halfLife: 60 },
    };
    const RANK_MULTIPLIERS = [1.0, 0.5, 0.25, 0.10, 0.10, 0.10];
    let totalSignalScore = 0;
    // Sort by date (most recent first) and apply rank multiplier
    const sorted = [...input.signals].sort((a, b) => b.date.getTime() - a.date.getTime());
    sorted.forEach((signal, index) => {
      const config = SIGNAL_CONFIG[signal.type] ?? { base: 8, halfLife: 30 };
      const daysElapsed = (Date.now() - signal.date.getTime()) / (1000 * 60 * 60 * 24);
      const decayed = config.base * Math.pow(0.5, daysElapsed / config.halfLife);
      // Skip signals that have decayed below the plancher threshold
      if (decayed < 1.0) return;
      const rankMultiplier = RANK_MULTIPLIERS[Math.min(index, RANK_MULTIPLIERS.length - 1)];
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

    // Lighthouse inversé: poor performance = high technical debt = opportunity
    const lh = input.lighthouseScore;
    if (lh !== undefined) {
      if (lh < 30) score += 8;
      else if (lh < 50) score += 7;
      else if (lh < 70) score += 5;
      else if (lh < 90) score += 2;
      // >= 90 → 0 points (site already good, no opportunity)
    }

    // Stack obsolète
    if (input.stackObsolete) score += 6;

    // RGAA violations
    if (input.rgaaViolationsCritical !== undefined && input.rgaaViolationsCritical > 0) score += 4;

    // Collectivité RGAA bonus
    if (input.segment === 'collectivite' && input.rgaaCompliant === false) score += 2;

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
    if (input.entrepriseFermee) return -100;
    return 0;
  }

  private calculateSoftMalus(input: ScoringInput): number {
    let malus = 0;

    // CA too low
    if (input.caAnnuel !== undefined && input.caAnnuel < 50_000) malus -= 15;

    // Croissance négative
    if (input.croissanceCaPct !== undefined) {
      if (input.croissanceCaPct < -20) malus -= 10;
      else if (input.croissanceCaPct < -10) malus -= 5;
    }

    // Effectif en baisse
    if (input.effectifEnBaisse) malus -= 5;

    // No contact channels at all
    if (!input.emailVerified && !input.phoneAvailable && !input.hasLinkedinProfile) malus -= 10;

    // Email quality
    if (input.emailCatchAll) malus -= 5;
    if (input.emailPersonnel) malus -= 8;

    // No decision maker identified
    if (input.decideurIdentifie === false) malus -= 10;

    // No signals at all
    if (input.signals.length === 0) malus -= 5;

    // Low completude
    if (input.completudePct !== undefined && input.completudePct < 40) malus -= 5;

    // BODACC negative event
    if (input.bodaccNegatif) malus -= 5;

    return malus;
  }

  private calculateBonus(input: ScoringInput): number {
    let bonus = 0;

    // Email + phone both available
    if (input.emailVerified && input.phoneAvailable) bonus += 5;

    // Recent signal bonus (within last 7 days)
    if (input.signals.some((s) => Date.now() - s.date.getTime() < 7 * 24 * 60 * 60 * 1000))
      bonus += 8;

    // Ecommerce platform bonuses
    if (input.segment === 'ecommerce' && input.ecommercePlatform) {
      const platform = input.ecommercePlatform.toLowerCase();
      if (platform.includes('shopify')) bonus += 5;
      else if (platform.includes('woocommerce') || platform.includes('woo')) bonus += 3;
    }

    // Collectivité bonuses
    if (input.segment === 'collectivite') {
      if (input.hasAppelOffre) bonus += 5;
      if (input.rgaaCompliant === false) bonus += 3;
    }

    // Startup bonuses
    if (input.segment === 'startup') {
      // Recent funding signal < 60 days
      const recentFunding = input.signals.some(
        (s) =>
          s.type === 'levee_fonds' &&
          Date.now() - s.date.getTime() < 60 * 24 * 60 * 60 * 1000,
      );
      if (recentFunding) bonus += 5;
      if (input.croissanceCaPct !== undefined && input.croissanceCaPct > 30) bonus += 3;
    }

    // Referral
    if (input.isReferral) bonus += 10;

    return bonus;
  }

  private categorize(score: number): ScoreCategory {
    const hotThreshold = this.getThreshold('SCOREUR_HOT_THRESHOLD', 75);
    const warmThreshold = this.getThreshold('SCOREUR_WARM_THRESHOLD', 50);
    const coldThreshold = this.getThreshold('SCOREUR_COLD_THRESHOLD', 25);

    if (score >= 90) return 'HOT_A';
    if (score >= 80) return 'HOT_B';
    if (score >= hotThreshold) return 'HOT_C';
    if (score >= warmThreshold) return 'WARM';
    if (score >= coldThreshold) return 'COLD';
    return 'DISQUALIFIE';
  }

  private determineRouting(category: ScoreCategory): ScoringResult['routing'] {
    const ROUTING: Record<ScoreCategory, ScoringResult['routing']> = {
      HOT_A: {
        sequenceId: 'SEQ_HOT_A_PREMIUM',
        canal: 'email',
        slaHours: 1,
        priority: 100,
        delayMs: 0,
      },
      HOT_B: {
        sequenceId: 'SEQ_HOT_B_PRIORITY',
        canal: 'email',
        slaHours: 2,
        priority: 75,
        delayMs: 300_000,
      },
      HOT_C: {
        sequenceId: 'SEQ_HOT_C_STANDARD',
        canal: 'email',
        slaHours: 4,
        priority: 50,
        delayMs: 3_600_000,
      },
      WARM: {
        sequenceId: 'SEQ_WARM_AUTO',
        canal: 'email',
        slaHours: 0,
        priority: 25,
        delayMs: 86_400_000,
      },
      COLD: {
        sequenceId: 'SEQ_COLD_NURTURE',
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
