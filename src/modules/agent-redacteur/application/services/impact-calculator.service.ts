import { Injectable } from '@nestjs/common';

@Injectable()
export class ImpactCalculatorService {
  calculatePerformanceImpact(
    lighthouseScore: number,
    monthlyRevenue?: number,
  ): {
    loadTimeS: number;
    bounceRatePct: number;
    conversionImpactPct: number;
    perteCaMensuelle: number;
    perteCaAnnuelle: number;
    messageImpact: string;
  } {
    const loadTimeS = this.estimateLoadTime(lighthouseScore);
    const bounceRatePct = this.estimateBounceRate(lighthouseScore);
    const conversionImpactPct = Math.max(0, (loadTimeS - 2) * 7);
    const revenueMensuel = monthlyRevenue ?? 0;
    const perteCaMensuelle = Math.round(revenueMensuel * 0.02 * (conversionImpactPct / 100));
    const perteCaAnnuelle = perteCaMensuelle * 12;
    const messageImpact = `votre site charge en ${loadTimeS.toFixed(1)}s — soit ${(loadTimeS / 2).toFixed(1)}x plus lent que la moyenne du secteur`;
    return {
      loadTimeS,
      bounceRatePct,
      conversionImpactPct,
      perteCaMensuelle,
      perteCaAnnuelle,
      messageImpact,
    };
  }

  private estimateLoadTime(lighthouseScore: number): number {
    if (lighthouseScore >= 90) return 1.2;
    if (lighthouseScore >= 70) return 2.2;
    if (lighthouseScore >= 50) return 3.5;
    if (lighthouseScore >= 40) return 5.0;
    return 8.0;
  }

  private estimateBounceRate(lighthouseScore: number): number {
    if (lighthouseScore >= 90) return 20;
    if (lighthouseScore >= 70) return 35;
    if (lighthouseScore >= 50) return 55;
    if (lighthouseScore >= 40) return 65;
    return 75;
  }
}
