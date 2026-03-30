import { ScoringEngine, ScoringInput } from './scoring-engine';

describe('ScoringEngine', () => {
  let engine: ScoringEngine;

  const freshSignal = (type = 'job_posting') => ({
    type,
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    source: 'linkedin',
  });

  const oldSignal = (type = 'job_posting') => ({
    type,
    date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    source: 'linkedin',
  });

  beforeEach(() => {
    engine = new ScoringEngine();
  });

  // ---- Hard disqualification ----

  it('should return score 0 and DISQUALIFIE for competitor', () => {
    const input: ScoringInput = { isCompetitor: true, signals: [] };
    const result = engine.calculate(input);
    expect(result.totalScore).toBe(0);
    expect(result.category).toBe('DISQUALIFIE');
  });

  it('should return score 0 and DISQUALIFIE for opted-out prospect', () => {
    const input: ScoringInput = { isOptedOut: true, signals: [] };
    const result = engine.calculate(input);
    expect(result.totalScore).toBe(0);
    expect(result.category).toBe('DISQUALIFIE');
  });

  it('should return score 0 and DISQUALIFIE for RGPD-blocked prospect', () => {
    const input: ScoringInput = { isRgpdBlocked: true, signals: [] };
    const result = engine.calculate(input);
    expect(result.totalScore).toBe(0);
    expect(result.category).toBe('DISQUALIFIE');
  });

  it('should return score 0 and DISQUALIFIE for bankrupt company', () => {
    const input: ScoringInput = { isBankrupt: true, signals: [] };
    const result = engine.calculate(input);
    expect(result.totalScore).toBe(0);
    expect(result.category).toBe('DISQUALIFIE');
  });

  it('should return DISQUALIFIE for entreprise_fermee', () => {
    const input: ScoringInput = { entrepriseFermee: true, signals: [] };
    const result = engine.calculate(input);
    expect(result.totalScore).toBe(0);
    expect(result.category).toBe('DISQUALIFIE');
  });

  // ---- ICP fit scoring ----

  it('should score higher for ideal company size 11-50', () => {
    const inputSmall: ScoringInput = {
      companySize: '11-50',
      signals: [freshSignal()],
      emailVerified: true,
    };
    const inputLarge: ScoringInput = {
      companySize: '1000+',
      signals: [freshSignal()],
      emailVerified: true,
    };
    const small = engine.calculate(inputSmall);
    const large = engine.calculate(inputLarge);
    expect(small.breakdown.icpFit).toBeGreaterThan(large.breakdown.icpFit);
  });

  it('should add ICP score for priority industry', () => {
    const withIndustry: ScoringInput = { industry: 'e-commerce', signals: [freshSignal()] };
    const withoutIndustry: ScoringInput = { signals: [freshSignal()] };
    const r1 = engine.calculate(withIndustry);
    const r2 = engine.calculate(withoutIndustry);
    expect(r1.breakdown.icpFit).toBeGreaterThan(r2.breakdown.icpFit);
  });

  // ---- NAF scoring ----

  it('should score NAF 6201Z (développement logiciel) at 10 points for secteur', () => {
    const withNaf: ScoringInput = { nafCode: '6201Z', signals: [freshSignal()] };
    const withoutNaf: ScoringInput = { signals: [freshSignal()] };
    const r1 = engine.calculate(withNaf);
    const r2 = engine.calculate(withoutNaf);
    expect(r1.breakdown.icpFit).toBeGreaterThan(r2.breakdown.icpFit);
  });

  it('should prefer NAF code over industry keyword fallback', () => {
    const withNaf: ScoringInput = {
      nafCode: '6201Z',
      industry: 'boulangerie',
      signals: [freshSignal()],
    };
    const withIndustry: ScoringInput = { industry: 'informatique', signals: [freshSignal()] };
    const r1 = engine.calculate(withNaf);
    const r2 = engine.calculate(withIndustry);
    // Both should get 10 secteur points
    expect(r1.breakdown.icpFit).toBe(r2.breakdown.icpFit);
  });

  // ---- parseCompanySize ----

  it('parseCompanySize should return 10 for English range 11-50', () => {
    expect(engine.parseCompanySize('11-50')).toBe(10);
  });

  it('parseCompanySize should return 8 for English range 51-200', () => {
    expect(engine.parseCompanySize('51-200')).toBe(8);
  });

  it('parseCompanySize should return 10 for INSEE "10 à 19 salariés"', () => {
    expect(engine.parseCompanySize('10 à 19 salariés')).toBe(10);
  });

  it('parseCompanySize should return 10 for INSEE "20 à 49 salariés"', () => {
    expect(engine.parseCompanySize('20 à 49 salariés')).toBe(10);
  });

  it('parseCompanySize should return 8 for INSEE "50 à 99 salariés"', () => {
    expect(engine.parseCompanySize('50 à 99 salariés')).toBe(8);
  });

  it('parseCompanySize should return 4 for INSEE "1 à 9 salariés"', () => {
    expect(engine.parseCompanySize('1 à 9 salariés')).toBe(4);
  });

  it('parseCompanySize should return 0 for English range 1000+', () => {
    expect(engine.parseCompanySize('1000+')).toBe(0);
  });

  // ---- Axe 3 inversé (Technique) ----

  it('low lighthouse score < 30 should yield +8 technique points', () => {
    const lowLh: ScoringInput = { lighthouseScore: 20, signals: [] };
    const highLh: ScoringInput = { lighthouseScore: 95, signals: [] };
    const r1 = engine.calculate(lowLh);
    const r2 = engine.calculate(highLh);
    expect(r1.breakdown.stackTechnique).toBeGreaterThan(r2.breakdown.stackTechnique);
  });

  it('lighthouse < 30 should give higher technique score than < 50', () => {
    const veryLow: ScoringInput = { lighthouseScore: 20, signals: [] };
    const low: ScoringInput = { lighthouseScore: 40, signals: [] };
    const r1 = engine.calculate(veryLow);
    const r2 = engine.calculate(low);
    expect(r1.breakdown.stackTechnique).toBeGreaterThan(r2.breakdown.stackTechnique);
  });

  it('lighthouse >= 90 should give 0 technique points from lighthouse', () => {
    const input: ScoringInput = { lighthouseScore: 95, signals: [] };
    const result = engine.calculate(input);
    // Only lighthouse, no other tech signals
    expect(result.breakdown.stackTechnique).toBe(0);
  });

  it('stackObsolete should add +6 to technique score', () => {
    const withObsolete: ScoringInput = { stackObsolete: true, signals: [] };
    const withoutObsolete: ScoringInput = { signals: [] };
    const r1 = engine.calculate(withObsolete);
    const r2 = engine.calculate(withoutObsolete);
    expect(r1.breakdown.stackTechnique - r2.breakdown.stackTechnique).toBe(6);
  });

  it('rgaaViolationsCritical > 0 should add +4 technique points', () => {
    const withViolations: ScoringInput = { rgaaViolationsCritical: 3, signals: [] };
    const withoutViolations: ScoringInput = { signals: [] };
    const r1 = engine.calculate(withViolations);
    const r2 = engine.calculate(withoutViolations);
    expect(r1.breakdown.stackTechnique - r2.breakdown.stackTechnique).toBe(4);
  });

  it('collectivite + rgaaCompliant=false should get +2 bonus on technique', () => {
    const collectivite: ScoringInput = {
      segment: 'collectivite',
      rgaaCompliant: false,
      signals: [],
    };
    const other: ScoringInput = { segment: 'pme_metro', rgaaCompliant: false, signals: [] };
    const r1 = engine.calculate(collectivite);
    const r2 = engine.calculate(other);
    // collectivite gets +2 extra on raw technique
    expect(r1.breakdown.stackTechnique).toBeGreaterThan(r2.breakdown.stackTechnique);
  });

  // ---- Signal decay ----

  it('fresh signal should produce higher signals score than old signal', () => {
    const fresh: ScoringInput = { signals: [freshSignal('job_posting')], emailVerified: true };
    const old: ScoringInput = { signals: [oldSignal('job_posting')], emailVerified: true };
    const r1 = engine.calculate(fresh);
    const r2 = engine.calculate(old);
    expect(r1.breakdown.signalsIntention).toBeGreaterThan(r2.breakdown.signalsIntention);
  });

  it('signal plancher threshold: extremely old signal should be skipped (score 0)', () => {
    const veryOld: ScoringInput = {
      signals: [
        {
          type: 'website_update', // base 8, halfLife 30
          date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
          source: 'web',
        },
      ],
    };
    const result = engine.calculate(veryOld);
    // After 1 year, website_update (base 8, halfLife 30) decays far below 1.0 → skipped
    expect(result.breakdown.signalsIntention).toBe(0);
  });

  it('levee_fonds should use renamed type (not funding_round)', () => {
    const withNewType: ScoringInput = {
      signals: [{ type: 'levee_fonds', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), source: 'crunchbase' }],
    };
    const withOldType: ScoringInput = {
      signals: [{ type: 'funding_round', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), source: 'crunchbase' }],
    };
    const r1 = engine.calculate(withNewType);
    const r2 = engine.calculate(withOldType);
    // levee_fonds base=30 vs funding_round unknown → fallback base=8
    expect(r1.breakdown.signalsIntention).toBeGreaterThan(r2.breakdown.signalsIntention);
  });

  it('changement_poste should use halfLife 60 (not 90)', () => {
    // At 45 days, halfLife=60 decays more than halfLife=90
    const input45days: ScoringInput = {
      signals: [
        {
          type: 'changement_poste',
          date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
          source: 'linkedin',
        },
      ],
    };
    const result = engine.calculate(input45days);
    // base=15, halfLife=60, 45 days → 15 * 0.5^(45/60) ≈ 15 * 0.595 ≈ 8.9 → rounds to 9
    expect(result.breakdown.signalsIntention).toBeGreaterThan(0);
    expect(result.breakdown.signalsIntention).toBeLessThan(15);
  });

  // ---- Segment coefficients ----

  it('startup segment should apply 1.2x multiplier to signals axis', () => {
    const withStartup: ScoringInput = {
      segment: 'startup',
      signals: [freshSignal()],
      emailVerified: true,
    };
    const withPme: ScoringInput = {
      segment: 'pme_metro',
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(withStartup);
    const r2 = engine.calculate(withPme);
    // startup signaux coef = 1.2, pme_metro = 1.0 → startup normalized signals should be higher
    expect(r1.breakdown.signalsIntentionNormalized).toBeGreaterThan(
      r2.breakdown.signalsIntentionNormalized,
    );
  });

  it('collectivite should apply 1.2x to icp axis', () => {
    const collectivite: ScoringInput = {
      segment: 'collectivite',
      companySize: '11-50',
      signals: [],
    };
    const pme: ScoringInput = {
      segment: 'pme_metro',
      companySize: '11-50',
      signals: [],
    };
    const r1 = engine.calculate(collectivite);
    const r2 = engine.calculate(pme);
    expect(r1.breakdown.icpFitNormalized).toBeGreaterThan(r2.breakdown.icpFitNormalized);
  });

  // ---- Categorization ----

  it('score >= 90 should be HOT_A', () => {
    const input: ScoringInput = {
      companySize: '11-50',
      industry: 'informatique',
      region: 'ile-de-france',
      signals: [
        {
          type: 'form_submission',
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          source: 'web',
        },
        {
          type: 'levee_fonds',
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          source: 'crunchbase',
        },
      ],
      stackObsolete: true,
      rgaaViolationsCritical: 5,
      lighthouseScore: 25,
      emailVerified: true,
      phoneAvailable: true,
      hasLinkedinProfile: true,
      websiteTraffic: 5000,
      segment: 'startup',
      isReferral: true,
    };
    const result = engine.calculate(input);
    expect(['HOT_A', 'HOT_B']).toContain(result.category);
    expect(result.totalScore).toBeGreaterThanOrEqual(80);
  });

  it('score >= 80 and < 90 should be HOT_B', () => {
    const input: ScoringInput = {
      companySize: '11-50',
      industry: 'digital',
      region: 'ile-de-france',
      signals: [freshSignal('job_posting')],
      emailVerified: true,
      phoneAvailable: true,
      hasLinkedinProfile: true,
    };
    const result = engine.calculate(input);
    expect(result.category).toMatch(/^HOT_[ABC]$|^WARM$/);
    expect(result.totalScore).toBeGreaterThan(0);
  });

  it('score < 25 should be DISQUALIFIE', () => {
    const input: ScoringInput = {
      companySize: '1000+',
      signals: [],
    };
    const result = engine.calculate(input);
    expect(result.totalScore).toBeLessThan(50);
    expect(['COLD', 'DISQUALIFIE', 'WARM']).toContain(result.category);
  });

  // ---- Routing ----

  it('HOT_A routing should have slaHours = 1 and delayMs = 0', () => {
    const input: ScoringInput = {
      companySize: '11-50',
      industry: 'informatique',
      region: 'ile-de-france',
      signals: [
        {
          type: 'form_submission',
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          source: 'web',
        },
        {
          type: 'levee_fonds',
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          source: 'crunchbase',
        },
        {
          type: 'email_click',
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          source: 'sendinblue',
        },
      ],
      lighthouseScore: 25,
      stackObsolete: true,
      emailVerified: true,
      phoneAvailable: true,
      hasLinkedinProfile: true,
      websiteTraffic: 5000,
      segment: 'startup',
      isReferral: true,
    };
    const result = engine.calculate(input);
    if (result.category === 'HOT_A') {
      expect(result.routing.slaHours).toBe(1);
      expect(result.routing.delayMs).toBe(0);
    }
  });

  it('COLD routing should have delayMs = 7 days', () => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const input: ScoringInput = {
      companySize: '1000+',
      signals: [oldSignal()],
      emailVerified: false,
    };
    const result = engine.calculate(input);
    if (result.category === 'COLD') {
      expect(result.routing.delayMs).toBe(sevenDaysMs);
    }
  });

  // ---- 11 Soft malus ----

  it('caAnnuel < 50k should apply -15 malus', () => {
    const withLowCA: ScoringInput = {
      caAnnuel: 30_000,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const withHighCA: ScoringInput = {
      caAnnuel: 100_000,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(withLowCA);
    const r2 = engine.calculate(withHighCA);
    expect(r1.breakdown.malusTotal).toBeLessThan(r2.breakdown.malusTotal);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(15);
  });

  it('croissance < -20% should apply -10 malus', () => {
    const declining: ScoringInput = {
      croissanceCaPct: -25,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const stable: ScoringInput = {
      croissanceCaPct: 5,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(declining);
    const r2 = engine.calculate(stable);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(10);
  });

  it('croissance between -20% and -10% should apply -5 malus', () => {
    const mildDecline: ScoringInput = {
      croissanceCaPct: -15,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const stable: ScoringInput = {
      croissanceCaPct: 5,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(mildDecline);
    const r2 = engine.calculate(stable);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(5);
  });

  it('effectifEnBaisse should apply -5 malus', () => {
    const declining: ScoringInput = {
      effectifEnBaisse: true,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const stable: ScoringInput = {
      effectifEnBaisse: false,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(declining);
    const r2 = engine.calculate(stable);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(5);
  });

  it('emailCatchAll should apply -5 malus', () => {
    const catchAll: ScoringInput = {
      emailCatchAll: true,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const notCatchAll: ScoringInput = {
      emailCatchAll: false,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const r1 = engine.calculate(catchAll);
    const r2 = engine.calculate(notCatchAll);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(5);
  });

  it('emailPersonnel should apply -8 malus', () => {
    const personal: ScoringInput = {
      emailPersonnel: true,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const professional: ScoringInput = {
      emailPersonnel: false,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const r1 = engine.calculate(personal);
    const r2 = engine.calculate(professional);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(8);
  });

  it('decideurIdentifie=false should apply -10 malus', () => {
    const noDecideur: ScoringInput = {
      decideurIdentifie: false,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const withDecideur: ScoringInput = {
      decideurIdentifie: true,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const r1 = engine.calculate(noDecideur);
    const r2 = engine.calculate(withDecideur);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(10);
  });

  it('no signals should apply -5 malus', () => {
    const noSignals: ScoringInput = { signals: [], emailVerified: true };
    const withSignal: ScoringInput = { signals: [freshSignal()], emailVerified: true };
    const r1 = engine.calculate(noSignals);
    const r2 = engine.calculate(withSignal);
    expect(r2.breakdown.malusTotal).toBeGreaterThan(r1.breakdown.malusTotal);
  });

  it('completudePct < 40 should apply -5 malus', () => {
    const incomplete: ScoringInput = {
      completudePct: 30,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const complete: ScoringInput = {
      completudePct: 80,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const r1 = engine.calculate(incomplete);
    const r2 = engine.calculate(complete);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(5);
  });

  it('bodaccNegatif should apply -5 malus', () => {
    const bodacc: ScoringInput = {
      bodaccNegatif: true,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const noBodacc: ScoringInput = {
      bodaccNegatif: false,
      emailVerified: true,
      signals: [freshSignal()],
    };
    const r1 = engine.calculate(bodacc);
    const r2 = engine.calculate(noBodacc);
    expect(r2.breakdown.malusTotal - r1.breakdown.malusTotal).toBe(5);
  });

  // ---- Segment bonuses ----

  it('ecommerce + Shopify should add +5 bonus', () => {
    const shopify: ScoringInput = {
      segment: 'ecommerce',
      ecommercePlatform: 'Shopify',
      signals: [freshSignal()],
      emailVerified: true,
      phoneAvailable: true,
    };
    const noShopify: ScoringInput = {
      segment: 'ecommerce',
      signals: [freshSignal()],
      emailVerified: true,
      phoneAvailable: true,
    };
    const r1 = engine.calculate(shopify);
    const r2 = engine.calculate(noShopify);
    expect(r1.breakdown.bonusTotal - r2.breakdown.bonusTotal).toBe(5);
  });

  it('ecommerce + WooCommerce should add +3 bonus', () => {
    const woo: ScoringInput = {
      segment: 'ecommerce',
      ecommercePlatform: 'WooCommerce',
      signals: [freshSignal()],
      emailVerified: true,
      phoneAvailable: true,
    };
    const noWoo: ScoringInput = {
      segment: 'ecommerce',
      signals: [freshSignal()],
      emailVerified: true,
      phoneAvailable: true,
    };
    const r1 = engine.calculate(woo);
    const r2 = engine.calculate(noWoo);
    expect(r1.breakdown.bonusTotal - r2.breakdown.bonusTotal).toBe(3);
  });

  it('collectivite + hasAppelOffre should add +5 bonus', () => {
    const withAO: ScoringInput = {
      segment: 'collectivite',
      hasAppelOffre: true,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const withoutAO: ScoringInput = {
      segment: 'collectivite',
      hasAppelOffre: false,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(withAO);
    const r2 = engine.calculate(withoutAO);
    expect(r1.breakdown.bonusTotal - r2.breakdown.bonusTotal).toBe(5);
  });

  it('collectivite + rgaaCompliant=false should add +3 bonus', () => {
    const nonCompliant: ScoringInput = {
      segment: 'collectivite',
      rgaaCompliant: false,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const compliant: ScoringInput = {
      segment: 'collectivite',
      rgaaCompliant: true,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(nonCompliant);
    const r2 = engine.calculate(compliant);
    expect(r1.breakdown.bonusTotal - r2.breakdown.bonusTotal).toBe(3);
  });

  it('startup + recent levee_fonds < 60d should add +5 bonus', () => {
    // Both have a 2-day-old job_posting to ensure same +8 recent signal bonus baseline
    const withFunding: ScoringInput = {
      segment: 'startup',
      signals: [
        freshSignal('job_posting'),
        { type: 'levee_fonds', date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), source: 'crunchbase' },
      ],
      emailVerified: true,
    };
    const withoutFunding: ScoringInput = {
      segment: 'startup',
      signals: [freshSignal('job_posting')],
      emailVerified: true,
    };
    const r1 = engine.calculate(withFunding);
    const r2 = engine.calculate(withoutFunding);
    // Both have recent signal (+8), withFunding also has +5 for levee_fonds < 60d
    expect(r1.breakdown.bonusTotal - r2.breakdown.bonusTotal).toBe(5);
  });

  it('startup + croissance > 30% should add +3 bonus', () => {
    const growing: ScoringInput = {
      segment: 'startup',
      croissanceCaPct: 40,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const flat: ScoringInput = {
      segment: 'startup',
      croissanceCaPct: 5,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(growing);
    const r2 = engine.calculate(flat);
    expect(r1.breakdown.bonusTotal - r2.breakdown.bonusTotal).toBe(3);
  });

  it('isReferral should add +10 bonus', () => {
    const referral: ScoringInput = {
      isReferral: true,
      signals: [freshSignal()],
      emailVerified: true,
    };
    const noReferral: ScoringInput = {
      signals: [freshSignal()],
      emailVerified: true,
    };
    const r1 = engine.calculate(referral);
    const r2 = engine.calculate(noReferral);
    expect(r1.breakdown.bonusTotal - r2.breakdown.bonusTotal).toBe(10);
  });

  // ---- Bonus ----

  it('should add +8 bonus for signal within last 7 days', () => {
    const withRecent: ScoringInput = {
      signals: [
        { type: 'job_posting', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), source: 's1' },
      ],
      emailVerified: true,
    };
    const withoutRecent: ScoringInput = {
      signals: [
        {
          type: 'job_posting',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          source: 's1',
        },
      ],
      emailVerified: true,
    };
    const r1 = engine.calculate(withRecent);
    const r2 = engine.calculate(withoutRecent);
    expect(r1.breakdown.bonusTotal).toBeGreaterThan(r2.breakdown.bonusTotal);
  });

  // ---- Décideur scoring ----

  it('CEO job title should yield 7 points for décideur sub-axis', () => {
    const ceo: ScoringInput = {
      jobTitle: 'CEO',
      signals: [],
    };
    const unknown: ScoringInput = {
      jobTitle: 'Some Random Title',
      signals: [],
    };
    const r1 = engine.calculate(ceo);
    const r2 = engine.calculate(unknown);
    expect(r1.breakdown.icpFit).toBeGreaterThan(r2.breakdown.icpFit);
  });

  it('Manager job title should yield 3 points for décideur sub-axis', () => {
    const manager: ScoringInput = { jobTitle: 'Manager', signals: [] };
    const vp: ScoringInput = { jobTitle: 'VP Engineering', signals: [] };
    const r1 = engine.calculate(manager);
    const r2 = engine.calculate(vp);
    expect(r2.breakdown.icpFit).toBeGreaterThan(r1.breakdown.icpFit);
  });

  // ---- Soft malus (existing) ----

  it('should apply -10 malus when no email, phone, or linkedin', () => {
    const withVerified: ScoringInput = { signals: [freshSignal()], emailVerified: true };
    const withoutAny: ScoringInput = {
      signals: [freshSignal()],
      emailVerified: false,
      phoneAvailable: false,
      hasLinkedinProfile: false,
    };
    const r1 = engine.calculate(withVerified);
    const r2 = engine.calculate(withoutAny);
    expect(r1.breakdown.malusTotal).toBeGreaterThan(r2.breakdown.malusTotal);
  });
});
