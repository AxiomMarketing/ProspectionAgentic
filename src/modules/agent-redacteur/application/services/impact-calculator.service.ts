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

  calculateAttributionImpact(
    segment: string,
    caAnnuel?: number,
  ): {
    pubPct: number;
    gaspillagePubAnnuel: number;
    manqueAGagnerAnnuel: number;
    messageImpact: string;
  } {
    const pubPct = segment === 'startup' ? 0.20 : segment === 'ecommerce' ? 0.15 : 0.15;
    const ca = caAnnuel ?? 0;
    const gaspillagePubAnnuel = Math.round(ca * pubPct * 0.30);
    const manqueAGagnerAnnuel = Math.round(gaspillagePubAnnuel * 3);
    const messageImpact = ca > 0
      ? `${Math.round(ca * pubPct / 12).toLocaleString('fr-FR')}€/mois de budget pub avec un tracking imprécis — jusqu'à ${Math.round(gaspillagePubAnnuel / 12).toLocaleString('fr-FR')}€/mois gaspillés`
      : 'budget publicitaire gaspillé faute de tracking précis';
    return { pubPct, gaspillagePubAnnuel, manqueAGagnerAnnuel, messageImpact };
  }

  calculateRGAAImpact(
    lighthouseA11y: number,
  ): {
    criteresNonConformes: number;
    coutMiseConformite: number;
    messageImpact: string;
  } {
    let criteresNonConformes: number;
    if (lighthouseA11y >= 95) {
      criteresNonConformes = 5;
    } else if (lighthouseA11y >= 85) {
      criteresNonConformes = 15;
    } else if (lighthouseA11y >= 70) {
      criteresNonConformes = 25;
    } else if (lighthouseA11y >= 50) {
      criteresNonConformes = 40;
    } else {
      criteresNonConformes = 55;
    }
    const coutMiseConformite = criteresNonConformes * 275;
    const messageImpact = `${criteresNonConformes} critères RGAA non conformes détectés — mise en conformité estimée à ${coutMiseConformite.toLocaleString('fr-FR')}€`;
    return { criteresNonConformes, coutMiseConformite, messageImpact };
  }

  calculateCartAbandonImpact(
    lighthouseScore: number,
    panierMoyen?: number,
  ): {
    loadTimeS: number;
    tauxAbandonPct: number;
    paniersPerdusMois: number;
    recoverableMensuel: number;
    messageImpact: string;
  } {
    const loadTimeS = this.estimateLoadTime(lighthouseScore);
    const tauxAbandonPct = this.estimateCartAbandon(loadTimeS);
    const panier = panierMoyen ?? 0;
    // Estimate: 1000 carts/month base assumption when panier is provided
    const estimatedCartsPerMonth = panier > 0 ? 1000 : 0;
    const paniersPerdusMois = Math.round(estimatedCartsPerMonth * (tauxAbandonPct / 100));
    const recoverableMensuel = Math.round(paniersPerdusMois * 0.20 * panier);
    const messageImpact = panier > 0
      ? `${tauxAbandonPct}% d'abandon panier lié à la lenteur — ${recoverableMensuel.toLocaleString('fr-FR')}€/mois récupérables`
      : `${tauxAbandonPct}% de taux d'abandon panier estimé à ${loadTimeS.toFixed(1)}s de chargement`;
    return { loadTimeS, tauxAbandonPct, paniersPerdusMois, recoverableMensuel, messageImpact };
  }

  calculateImpact(
    segment: string,
    prospect: { companyRevenue?: number | null; lighthouseScore?: number; lighthouseA11y?: number; panierMoyen?: number; caAnnuel?: number },
    enrichmentData: Record<string, unknown>,
  ): {
    messageImpact: string;
    perteCaMensuelle?: number;
    perteCaAnnuelle?: number;
    gaspillagePubAnnuel?: number;
    criteresNonConformes?: number;
    recoverableMensuel?: number;
  } {
    const lighthouseScore = (enrichmentData['lighthouseScore'] as number | undefined) ?? prospect.lighthouseScore ?? 60;
    const lighthouseA11y = (enrichmentData['lighthouseA11y'] as number | undefined) ?? prospect.lighthouseA11y ?? 70;
    const panierMoyen = (enrichmentData['panierMoyen'] as number | undefined) ?? prospect.panierMoyen;
    const caAnnuel = (enrichmentData['caAnnuel'] as number | undefined) ?? prospect.caAnnuel;

    if (segment === 'collectivite') {
      const result = this.calculateRGAAImpact(lighthouseA11y);
      return {
        messageImpact: result.messageImpact,
        criteresNonConformes: result.criteresNonConformes,
      };
    }

    if (segment === 'ecommerce' && panierMoyen) {
      const result = this.calculateCartAbandonImpact(lighthouseScore, panierMoyen);
      return {
        messageImpact: result.messageImpact,
        recoverableMensuel: result.recoverableMensuel,
      };
    }

    if ((segment === 'startup' || segment === 'ecommerce') && caAnnuel) {
      const result = this.calculateAttributionImpact(segment, caAnnuel);
      return {
        messageImpact: result.messageImpact,
        gaspillagePubAnnuel: result.gaspillagePubAnnuel,
      };
    }

    // Default: performance impact for pme_metro and agence_wl
    const monthlyRevenue = (prospect.companyRevenue ?? undefined) as number | undefined;
    const result = this.calculatePerformanceImpact(lighthouseScore, monthlyRevenue);
    return {
      messageImpact: result.messageImpact,
      perteCaMensuelle: result.perteCaMensuelle,
      perteCaAnnuelle: result.perteCaAnnuelle,
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

  private estimateCartAbandon(loadTimeS: number): number {
    if (loadTimeS <= 1.5) return 55;
    if (loadTimeS <= 2.5) return 65;
    if (loadTimeS <= 4.0) return 72;
    if (loadTimeS <= 6.0) return 80;
    return 88;
  }
}
