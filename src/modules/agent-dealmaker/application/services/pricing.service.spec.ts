import { BadRequestException } from '@nestjs/common';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  // ---- getPrice ----

  it('should return 1500 for site_vitrine bronze', () => {
    expect(service.getPrice('site_vitrine', 'bronze')).toBe(1500);
  });

  it('should return 5000 for site_vitrine silver', () => {
    expect(service.getPrice('site_vitrine', 'silver')).toBe(5000);
  });

  it('should return 9500 for site_vitrine gold', () => {
    expect(service.getPrice('site_vitrine', 'gold')).toBe(9500);
  });

  it('should return 5000 for ecommerce_shopify bronze', () => {
    expect(service.getPrice('ecommerce_shopify', 'bronze')).toBe(5000);
  });

  it('should return 15000 for ecommerce_shopify gold', () => {
    expect(service.getPrice('ecommerce_shopify', 'gold')).toBe(15000);
  });

  it('should return 990 for tracking_server_side bronze', () => {
    expect(service.getPrice('tracking_server_side', 'bronze')).toBe(990);
  });

  it('should return 2490 for tracking_server_side gold', () => {
    expect(service.getPrice('tracking_server_side', 'gold')).toBe(2490);
  });

  it('should throw BadRequestException for unknown service type', () => {
    expect(() => service.getPrice('unknown_service', 'gold')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for unknown tier', () => {
    expect(() => service.getPrice('site_vitrine', 'platinum')).toThrow(BadRequestException);
  });

  // ---- getAvailableServices ----

  it('should return all 6 available services', () => {
    const services = service.getAvailableServices();
    expect(services).toHaveLength(6);
    expect(services).toContain('site_vitrine');
    expect(services).toContain('ecommerce_shopify');
    expect(services).toContain('app_flutter');
    expect(services).toContain('tracking_server_side');
    expect(services).toContain('rgaa');
    expect(services).toContain('app_metier');
  });

  // ---- getPricingDetail ----

  it('should return full tier detail for app_flutter silver', () => {
    const detail = service.getPricingDetail('app_flutter', 'silver');
    expect(detail.nom).toBe('Complete');
    expect(detail.prix).toBe(35000);
    expect(detail.timeline).toBe(14);
    expect(detail.features).toContain('10+ écrans');
  });

  // ---- generateLineItems ----

  it('should generate a single line item with correct format', () => {
    const items = service.generateLineItems('site_vitrine', 'bronze');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      description: 'site_vitrine — Essentiel',
      quantity: 1,
      unitPriceEur: 1500,
    });
  });

  it('should throw BadRequestException for unknown service in generateLineItems', () => {
    expect(() => service.generateLineItems('ghost', 'gold')).toThrow(BadRequestException);
  });
});
