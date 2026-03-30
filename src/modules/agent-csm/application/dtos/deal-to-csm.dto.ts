import { z } from 'zod';

export const DealToCSMSchema = z.object({
  deal_id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  prospect: z.object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    email: z.string().email(),
    telephone: z.string().optional(),
    linkedin_url: z.string().url().optional(),
    poste: z.string().min(1),
  }),
  entreprise: z.object({
    nom: z.string().min(1),
    siret: z.string().length(9).optional(),
    site_web: z.string().url().optional(),
    secteur: z.string().optional(),
    taille: z.number().int().positive().optional(),
  }),
  contrat: z.object({
    montant_ht: z.number().positive(),
    tier: z.enum(['bronze', 'silver', 'gold']),
    type_projet: z.enum(['site_vitrine', 'ecommerce_shopify', 'app_flutter', 'app_metier', 'rgaa', 'tracking_server_side']),
    scope_detaille: z.array(z.string()).optional(),
    date_signature: z.string().datetime(),
    date_demarrage_prevue: z.string().datetime(),
    duree_estimee_semaines: z.number().int().positive(),
    conditions_paiement: z.enum(['50/50', '30/40/30', 'mensuel']),
    contrat_pdf_url: z.string().url().optional(),
  }),
  notes_vente: z.string().optional(),
  metadata: z.object({
    agent: z.literal('agent_8_dealmaker'),
    created_at: z.string().datetime(),
    deal_cycle_days: z.number().int().nonnegative().optional(),
    nb_relances: z.number().int().nonnegative().optional(),
    engagement_score_final: z.number().min(0).max(100).optional(),
    version: z.string().optional(),
  }),
});

export type DealToCSMDto = z.infer<typeof DealToCSMSchema>;
