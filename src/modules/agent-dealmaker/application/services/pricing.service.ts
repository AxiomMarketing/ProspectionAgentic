import { Injectable, BadRequestException } from '@nestjs/common';

interface TierDetail {
  nom: string;
  prix: number;
  features: string[];
  timeline: number;
}

type ServiceKey =
  | 'site_vitrine'
  | 'ecommerce_shopify'
  | 'app_flutter'
  | 'app_metier'
  | 'rgaa'
  | 'tracking_server_side';

type TierKey = 'bronze' | 'silver' | 'gold';

const SERVICE_TEMPLATES: Record<ServiceKey, Record<TierKey, TierDetail>> = {
  site_vitrine: {
    bronze: { nom: 'Essentiel', prix: 1500, features: ['Template WordPress', '5-8 pages', 'Responsive', 'Contact', 'SSL 1 an'], timeline: 3 },
    silver: { nom: 'Professionnel', prix: 5000, features: ['Design sur-mesure', '10-15 pages', 'SEO complet', 'CRM intégration'], timeline: 5 },
    gold: { nom: 'Premium', prix: 9500, features: ['Tout Silver +', 'Animations avancées', 'Blog CMS', 'Lighthouse 95+', 'Support 6 mois'], timeline: 8 },
  },
  ecommerce_shopify: {
    bronze: { nom: 'Starter', prix: 5000, features: ['Thème Shopify', '50 produits', 'Paiement standard'], timeline: 4 },
    silver: { nom: 'Growth', prix: 10000, features: ['Design sur-mesure', '200 produits', 'Klaviyo avancé', 'SEO'], timeline: 6 },
    gold: { nom: 'Scale', prix: 15000, features: ['Tout Growth +', 'Apps custom', 'Multi-devises'], timeline: 10 },
  },
  app_flutter: {
    bronze: { nom: 'MVP', prix: 15000, features: ['iOS + Android', '3-5 écrans', 'Auth', 'API'], timeline: 8 },
    silver: { nom: 'Complete', prix: 35000, features: ['10+ écrans', 'Push notifications', 'Paiement', 'Admin panel'], timeline: 14 },
    gold: { nom: 'Enterprise', prix: 60000, features: ['Tout Complete +', 'Offline mode', 'Analytics', 'CI/CD'], timeline: 22 },
  },
  app_metier: {
    bronze: { nom: 'Module Unique', prix: 25000, features: ['1 module', 'Dashboard', 'Auth SSO'], timeline: 10 },
    silver: { nom: 'Multi-Modules', prix: 50000, features: ['3-5 modules', 'API REST', 'Reporting'], timeline: 18 },
    gold: { nom: 'Sur-Mesure', prix: 75000, features: ['Modules illimités', 'Intégrations ERP', 'SLA 4h'], timeline: 26 },
  },
  rgaa: {
    bronze: { nom: 'Audit + Essentiels', prix: 8000, features: ['Audit RGAA complet', 'Correctifs critiques'], timeline: 4 },
    silver: { nom: 'Refonte Partielle', prix: 20000, features: ['Audit + refonte composants', 'Tests auto'], timeline: 8 },
    gold: { nom: 'Conformité Totale', prix: 40000, features: ['Refonte complète', 'Formation', 'Attestation'], timeline: 14 },
  },
  tracking_server_side: {
    bronze: { nom: 'Standard', prix: 990, features: ['GTM server-side', 'GA4', 'Basic consent'], timeline: 2 },
    silver: { nom: 'Avancé', prix: 1490, features: ['Tout Standard +', 'Meta CAPI', 'Enrichissement'], timeline: 3 },
    gold: { nom: 'Enterprise', prix: 2490, features: ['Tout Avancé +', 'CDP', 'Attribution', 'Support 12m'], timeline: 4 },
  },
};

@Injectable()
export class PricingService {
  getPricingDetail(serviceType: string, tier: string): TierDetail {
    const service = SERVICE_TEMPLATES[serviceType as ServiceKey];
    if (!service) {
      throw new BadRequestException(`Unknown service type: ${serviceType}`);
    }
    const tierDetail = service[tier as TierKey];
    if (!tierDetail) {
      throw new BadRequestException(`Unknown tier: ${tier} for service ${serviceType}`);
    }
    return tierDetail;
  }

  getPrice(serviceType: string, tier: string): number {
    return this.getPricingDetail(serviceType, tier).prix;
  }

  getAvailableServices(): string[] {
    return Object.keys(SERVICE_TEMPLATES);
  }

  generateLineItems(
    serviceType: string,
    tier: string,
  ): Array<{ description: string; quantity: number; unitPriceEur: number }> {
    const detail = this.getPricingDetail(serviceType, tier);
    return [{ description: `${serviceType} — ${detail.nom}`, quantity: 1, unitPriceEur: detail.prix }];
  }
}
