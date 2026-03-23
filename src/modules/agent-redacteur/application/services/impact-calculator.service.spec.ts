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
});
