import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  // ---- getPrice ----

  it('should return 5000 for refonte_site bronze', () => {
    expect(service.getPrice('refonte_site', 'bronze')).toBe(5000);
  });

  it('should return 7500 for refonte_site silver', () => {
    expect(service.getPrice('refonte_site', 'silver')).toBe(7500);
  });

  it('should return 10000 for refonte_site gold', () => {
    expect(service.getPrice('refonte_site', 'gold')).toBe(10000);
  });

  it('should return 10000 for ecommerce bronze', () => {
    expect(service.getPrice('ecommerce', 'bronze')).toBe(10000);
  });

  it('should return 20000 for ecommerce gold', () => {
    expect(service.getPrice('ecommerce', 'gold')).toBe(20000);
  });

  it('should return 990 for tracking bronze', () => {
    expect(service.getPrice('tracking', 'bronze')).toBe(990);
  });

  it('should return 0 for unknown service type', () => {
    expect(service.getPrice('unknown_service', 'gold')).toBe(0);
  });

  it('should return 0 for unknown tier', () => {
    expect(service.getPrice('refonte_site', 'platinum')).toBe(0);
  });

  // ---- getAvailableServices ----

  it('should return all 6 available services', () => {
    const services = service.getAvailableServices();
    expect(services).toHaveLength(6);
    expect(services).toContain('refonte_site');
    expect(services).toContain('ecommerce');
    expect(services).toContain('app_flutter');
    expect(services).toContain('tracking');
  });

  // ---- generateLineItems ----

  it('should generate a single line item with correct format', () => {
    const items = service.generateLineItems('refonte_site', 'bronze');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      description: 'refonte_site — offre bronze',
      quantity: 1,
      unitPriceEur: 5000,
    });
  });

  it('should generate line item with 0 price for unknown service', () => {
    const items = service.generateLineItems('ghost', 'gold');
    expect(items[0].unitPriceEur).toBe(0);
  });
});
