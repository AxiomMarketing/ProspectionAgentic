import { z } from 'zod';

export const ReferralToAgent1Schema = z.object({
  type: z.literal('referral_lead'),
  referral_id: z.string().uuid(),
  referred_by: z.object({
    client_id: z.string().uuid(),
    referral_code: z.string().regex(/^AXIOM-[A-Z]{1,3}-[A-Z0-9]{8,16}$/),
  }),
  lead: z.object({
    prenom: z.string().min(1).max(100),
    nom: z.string().min(1).max(100),
    email: z.string().email(),
    entreprise: z.string().min(1),
    besoin: z.string().min(1),
    source: z.literal('referral'),
  }),
  priority_boost: z.literal(40),
  metadata: z.object({
    agent: z.literal('agent_10_csm'),
    created_at: z.string().datetime(),
    version: z.string(),
  }),
});

export const ChurnedClientToAgent6Schema = z.object({
  type: z.literal('churned_client'),
  client_id: z.string().uuid(),
  deal_id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  client: z.object({
    prenom: z.string(),
    nom: z.string(),
    email: z.string().email(),
    telephone: z.string().optional(),
    entreprise_nom: z.string(),
    secteur: z.string(),
    poste: z.string(),
  }),
  churn_reason: z.enum(['insatisfaction', 'budget', 'concurrent', 'silence', 'interne', 'autre']),
  churn_detail: z.string(),
  last_health_score: z.number().min(0).max(100),
  last_nps_score: z.number().min(0).max(10).optional(),
  last_contact_date: z.string().datetime(),
  total_revenue: z.number().nonnegative(),
  services_utilises: z.array(z.string()),
  duree_relation_mois: z.number().int().nonnegative(),
  nb_projets_realises: z.number().int().nonnegative(),
  win_back_strategy: z.string(),
  recontact_date: z.string().datetime(),
  offre_speciale_suggeree: z.string().optional(),
  metadata: z.object({
    agent: z.literal('agent_10_csm'),
    created_at: z.string().datetime(),
    version: z.string(),
  }),
});

export const UpsellToAgent8Schema = z.object({
  type: z.literal('upsell_opportunity'),
  client_id: z.string().uuid(),
  existing_deal_id: z.string().uuid(),
  client: z.object({
    prenom: z.string(),
    nom: z.string(),
    email: z.string().email(),
    telephone: z.string().optional(),
    entreprise_nom: z.string(),
    siret: z.string().optional(),
    secteur: z.string(),
    site_web: z.string().optional(),
  }),
  upsell: z.object({
    product_target: z.enum(['site_vitrine', 'ecommerce_shopify', 'app_flutter', 'app_metier', 'rgaa', 'tracking_server_side']),
    estimated_value: z.number().positive(),
    upsell_score: z.number().min(0).max(100),
    priority: z.enum(['high', 'medium']),
    signals_detected: z.array(z.string()).min(1),
    recommended_timing: z.string().optional(),
    template_id: z.string().optional(),
  }),
  current_services: z.array(z.string()),
  health_score: z.number().min(60),
  last_nps_score: z.number().optional(),
  customer_since: z.string().datetime(),
  total_revenue_to_date: z.number().nonnegative(),
  notes: z.string().optional(),
  metadata: z.object({
    agent: z.literal('agent_10_csm'),
    created_at: z.string().datetime(),
    version: z.string(),
  }),
});

export type ReferralToAgent1Dto = z.infer<typeof ReferralToAgent1Schema>;
export type ChurnedClientToAgent6Dto = z.infer<typeof ChurnedClientToAgent6Schema>;
export type UpsellToAgent8Dto = z.infer<typeof UpsellToAgent8Schema>;
