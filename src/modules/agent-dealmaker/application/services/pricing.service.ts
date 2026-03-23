import { Injectable } from '@nestjs/common';

@Injectable()
export class PricingService {
  private readonly PRICING: Record<string, Record<string, number>> = {
    refonte_site: { bronze: 5000, silver: 7500, gold: 10000 },
    ecommerce: { bronze: 10000, silver: 15000, gold: 20000 },
    app_flutter: { bronze: 35000, silver: 52500, gold: 70000 },
    app_metier: { bronze: 50000, silver: 75000, gold: 100000 },
    rgaa_compliance: { bronze: 20000, silver: 30000, gold: 40000 },
    tracking: { bronze: 990, silver: 1485, gold: 1980 },
  };

  getPrice(serviceType: string, tier: string): number {
    return this.PRICING[serviceType]?.[tier] ?? 0;
  }

  getAvailableServices(): string[] {
    return Object.keys(this.PRICING);
  }

  generateLineItems(
    serviceType: string,
    tier: string,
  ): Array<{ description: string; quantity: number; unitPriceEur: number }> {
    const price = this.getPrice(serviceType, tier);
    return [{ description: `${serviceType} — offre ${tier}`, quantity: 1, unitPriceEur: price }];
  }
}
