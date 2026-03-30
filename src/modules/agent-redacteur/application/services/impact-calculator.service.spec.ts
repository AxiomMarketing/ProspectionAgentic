import { ImpactCalculatorService } from './impact-calculator.service';

describe('ImpactCalculatorService', () => {
  let service: ImpactCalculatorService;

  beforeEach(() => {
    service = new ImpactCalculatorService();
  });

  // ---- estimateLoadTime ----

  it('should return 1.2s for lighthouse score >= 90', () => {
    const result = service.calculatePerformanceImpact(95);
    expect(result.loadTimeS).toBe(1.2);
  });

  it('should return 2.2s for lighthouse score >= 70 and < 90', () => {
    const result = service.calculatePerformanceImpact(75);
    expect(result.loadTimeS).toBe(2.2);
  });

  it('should return 3.5s for lighthouse score >= 50 and < 70', () => {
    const result = service.calculatePerformanceImpact(55);
    expect(result.loadTimeS).toBe(3.5);
  });

  it('should return 5.0s for lighthouse score >= 40 and < 50', () => {
    const result = service.calculatePerformanceImpact(45);
    expect(result.loadTimeS).toBe(5.0);
  });

  it('should return 8.0s for lighthouse score < 40', () => {
    const result = service.calculatePerformanceImpact(30);
    expect(result.loadTimeS).toBe(8.0);
  });

  // ---- estimateBounceRate ----

  it('should return 20% bounce rate for score >= 90', () => {
    const result = service.calculatePerformanceImpact(92);
    expect(result.bounceRatePct).toBe(20);
  });

  it('should return 55% bounce rate for score >= 50 and < 70', () => {
    const result = service.calculatePerformanceImpact(60);
    expect(result.bounceRatePct).toBe(55);
  });

  it('should return 75% bounce rate for score < 40', () => {
    const result = service.calculatePerformanceImpact(20);
    expect(result.bounceRatePct).toBe(75);
  });

  // ---- conversionImpact ----

  it('should have 0 conversion impact when load time <= 2s', () => {
    const result = service.calculatePerformanceImpact(90); // loadTime = 1.2s → (1.2 - 2) = negative → max(0, ...)
    expect(result.conversionImpactPct).toBe(0);
  });

  it('should calculate positive conversion impact when load time > 2s', () => {
    const result = service.calculatePerformanceImpact(55); // loadTime = 3.5s → (3.5 - 2) * 7 = 10.5
    expect(result.conversionImpactPct).toBeCloseTo(10.5, 1);
  });

  // ---- revenue loss ----

  it('should calculate perteCaMensuelle with known inputs', () => {
    // lightscore=55 → loadTime=3.5, conversionImpact=(3.5-2)*7=10.5
    // perteCaMensuelle = round(10000 * 0.02 * (10.5/100)) = round(21) = 21
    const result = service.calculatePerformanceImpact(55, 10000);
    expect(result.perteCaMensuelle).toBe(21);
    expect(result.perteCaAnnuelle).toBe(21 * 12);
  });

  it('should return 0 revenue loss when monthlyRevenue is not provided', () => {
    const result = service.calculatePerformanceImpact(30);
    expect(result.perteCaMensuelle).toBe(0);
    expect(result.perteCaAnnuelle).toBe(0);
  });

  // ---- messageImpact format ----

  it('should include load time in the message impact string', () => {
    const result = service.calculatePerformanceImpact(55);
    expect(result.messageImpact).toContain('3.5s');
    expect(result.messageImpact).toContain('plus lent');
  });

  it('messageImpact should show correct ratio vs 2s baseline', () => {
    const result = service.calculatePerformanceImpact(30); // loadTime = 8.0s → 8/2 = 4.0x
    expect(result.messageImpact).toContain('4.0x');
  });

  // ---- calculateAttributionImpact ----

  describe('calculateAttributionImpact', () => {
    it('should use 20% pubPct for startup segment', () => {
      const result = service.calculateAttributionImpact('startup', 500000);
      expect(result.pubPct).toBe(0.20);
    });

    it('should use 15% pubPct for ecommerce segment', () => {
      const result = service.calculateAttributionImpact('ecommerce', 500000);
      expect(result.pubPct).toBe(0.15);
    });

    it('should calculate gaspillagePubAnnuel = ca * pubPct * 0.30', () => {
      // startup: ca=500000, pubPct=0.20 → budgetPub=100000, gaspillage=30000
      const result = service.calculateAttributionImpact('startup', 500000);
      expect(result.gaspillagePubAnnuel).toBe(30000);
    });

    it('should calculate manqueAGagnerAnnuel = gaspillage * 3', () => {
      const result = service.calculateAttributionImpact('startup', 500000);
      expect(result.manqueAGagnerAnnuel).toBe(90000);
    });

    it('should return 0 values when caAnnuel is not provided', () => {
      const result = service.calculateAttributionImpact('ecommerce');
      expect(result.gaspillagePubAnnuel).toBe(0);
      expect(result.manqueAGagnerAnnuel).toBe(0);
    });

    it('should include budget info in messageImpact when ca is provided', () => {
      const result = service.calculateAttributionImpact('ecommerce', 120000);
      expect(result.messageImpact).toContain('gaspillés');
    });
  });

  // ---- calculateRGAAImpact ----

  describe('calculateRGAAImpact', () => {
    it('should return 5 criteres for a11y score >= 95', () => {
      const result = service.calculateRGAAImpact(97);
      expect(result.criteresNonConformes).toBe(5);
    });

    it('should return 15 criteres for a11y score >= 85 and < 95', () => {
      const result = service.calculateRGAAImpact(88);
      expect(result.criteresNonConformes).toBe(15);
    });

    it('should return 25 criteres for a11y score >= 70 and < 85', () => {
      const result = service.calculateRGAAImpact(72);
      expect(result.criteresNonConformes).toBe(25);
    });

    it('should return 40 criteres for a11y score >= 50 and < 70', () => {
      const result = service.calculateRGAAImpact(55);
      expect(result.criteresNonConformes).toBe(40);
    });

    it('should return 55 criteres for a11y score < 50', () => {
      const result = service.calculateRGAAImpact(45);
      expect(result.criteresNonConformes).toBe(55);
    });

    it('should calculate coutMiseConformite = criteres * 275', () => {
      const result = service.calculateRGAAImpact(72); // 25 criteres
      expect(result.coutMiseConformite).toBe(25 * 275);
    });

    it('should include criteres count in messageImpact', () => {
      const result = service.calculateRGAAImpact(55);
      expect(result.messageImpact).toContain('40');
      expect(result.messageImpact).toContain('RGAA');
    });
  });

  // ---- calculateCartAbandonImpact ----

  describe('calculateCartAbandonImpact', () => {
    it('should return 65% abandon for score >= 70 (loadTime 2.2s)', () => {
      const result = service.calculateCartAbandonImpact(75);
      expect(result.tauxAbandonPct).toBe(65);
    });

    it('should return 72% abandon for score >= 50 and < 70 (loadTime 3.5s)', () => {
      const result = service.calculateCartAbandonImpact(55);
      expect(result.tauxAbandonPct).toBe(72);
    });

    it('should return 80% abandon for score >= 40 and < 50 (loadTime 5.0s)', () => {
      const result = service.calculateCartAbandonImpact(45);
      expect(result.tauxAbandonPct).toBe(80);
    });

    it('should return 88% abandon for score < 40 (loadTime 8.0s)', () => {
      const result = service.calculateCartAbandonImpact(30);
      expect(result.tauxAbandonPct).toBe(88);
    });

    it('should return 0 recoverableMensuel when panierMoyen not provided', () => {
      const result = service.calculateCartAbandonImpact(55);
      expect(result.recoverableMensuel).toBe(0);
    });

    it('should calculate recoverableMensuel = paniersPerdusMois * 0.20 * panierMoyen', () => {
      // score=55 → loadTime=3.5s → abandon=72% → paniersPerdus=720 (1000*72%)
      // recoverable = 720 * 0.20 * 80 = 11520
      const result = service.calculateCartAbandonImpact(55, 80);
      expect(result.recoverableMensuel).toBe(11520);
    });

    it('should include abandon rate in messageImpact', () => {
      const result = service.calculateCartAbandonImpact(55, 80);
      expect(result.messageImpact).toContain('72%');
    });
  });

  // ---- calculateImpact routing ----

  describe('calculateImpact', () => {
    it('should route collectivite to RGAA formula', () => {
      const result = service.calculateImpact('collectivite', {}, { lighthouseA11y: 55 });
      expect(result.criteresNonConformes).toBe(40);
      expect(result.messageImpact).toContain('RGAA');
    });

    it('should route ecommerce with panierMoyen to cart abandon formula', () => {
      const result = service.calculateImpact('ecommerce', {}, { lighthouseScore: 55, panierMoyen: 80 });
      expect(result.recoverableMensuel).toBeDefined();
      expect(result.messageImpact).toContain('abandon');
    });

    it('should route startup with caAnnuel to attribution formula', () => {
      const result = service.calculateImpact('startup', {}, { caAnnuel: 500000 });
      expect(result.gaspillagePubAnnuel).toBeDefined();
    });

    it('should route pme_metro to performance formula', () => {
      const result = service.calculateImpact('pme_metro', { companyRevenue: 10000 }, { lighthouseScore: 55 });
      expect(result.perteCaMensuelle).toBeDefined();
      expect(result.messageImpact).toContain('plus lent');
    });

    it('should default to performance formula for agence_wl', () => {
      const result = service.calculateImpact('agence_wl', {}, { lighthouseScore: 45 });
      expect(result.perteCaMensuelle).toBeDefined();
    });
  });
});
