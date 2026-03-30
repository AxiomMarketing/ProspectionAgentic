import { Injectable, Logger } from '@nestjs/common';

interface ScoringInput {
  signalForce: number;       // Best signal score (0-100)
  sourceCount: number;        // Number of distinct sources
  multiSourceBonus: number;   // From deduplication (0/10/15)
  segment?: string;           // pme_metro, ecommerce, collectivite, startup, agence_wl
  signalAge?: Date;           // When was the signal first detected
  location?: string;          // Geographic info
}

interface PreScoreResult {
  totalScore: number;
  breakdown: {
    signalForce: number;    // max 35
    multiSource: number;    // max 15
    segmentMatch: number;   // max 25
    freshness: number;      // max 10
    geo: number;            // max 15
  };
  category: 'HOT' | 'WARM' | 'COLD';
}

const AXIOM_TARGET_SEGMENTS = new Set([
  'pme_metro',
  'ecommerce',
  'collectivite',
  'startup',
  'agence_wl',
]);

@Injectable()
export class PreScoringService {
  private readonly logger = new Logger(PreScoringService.name);

  /**
   * 5-axis pre-scoring as defined in spec:
   * signal_force (max 35) + multi_source (max 15) + segment_match (max 25) + fraicheur (max 10) + geo (max 15)
   */
  calculatePreScore(input: ScoringInput): PreScoreResult {
    const breakdown = {
      signalForce: this.scoreSignalForce(input.signalForce),
      multiSource: Math.min(15, input.multiSourceBonus),
      segmentMatch: this.scoreSegment(input.segment),
      freshness: this.scoreFreshness(input.signalAge),
      geo: this.scoreGeo(input.location),
    };

    const totalScore = Math.min(
      100,
      breakdown.signalForce +
      breakdown.multiSource +
      breakdown.segmentMatch +
      breakdown.freshness +
      breakdown.geo,
    );

    const category = totalScore >= 60 ? 'HOT' : totalScore >= 40 ? 'WARM' : 'COLD';

    return { totalScore, breakdown, category };
  }

  /** Signal force: map 0-100 relevance to 0-35 points */
  private scoreSignalForce(relevance: number): number {
    return Math.round((Math.min(100, Math.max(0, relevance)) / 100) * 35);
  }

  /** Segment match: in Axiom targets → 20-25 pts */
  private scoreSegment(segment?: string): number {
    if (!segment) return 0;
    if (AXIOM_TARGET_SEGMENTS.has(segment.toLowerCase())) return 22;
    return 5; // Known but not priority segment
  }

  /** Freshness: signal age in days → 0-10 pts */
  private scoreFreshness(signalAge?: Date): number {
    if (!signalAge) return 5; // Unknown age, give middle score
    const daysOld = Math.floor((Date.now() - signalAge.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOld <= 1) return 10;
    if (daysOld <= 3) return 8;
    if (daysOld <= 7) return 6;
    if (daysOld <= 14) return 4;
    if (daysOld <= 30) return 2;
    return 0;
  }

  /** Geo: DOM-TOM → 15, IDF → 10, France → 5 */
  private scoreGeo(location?: string): number {
    if (!location) return 3; // Unknown
    const loc = location.toLowerCase();

    // DOM-TOM
    if (['réunion', 'reunion', '974', 'guadeloupe', '971', 'martinique', '972', 'guyane', '973', 'mayotte', '976'].some(t => loc.includes(t))) {
      return 15;
    }

    // Île-de-France
    if (['paris', 'île-de-france', 'ile-de-france', '75', '92', '93', '94', '91', '77', '78', '95'].some(t => loc.includes(t))) {
      return 10;
    }

    // France
    if (['france', 'fr'].some(t => loc.includes(t))) {
      return 5;
    }

    return 3;
  }
}
