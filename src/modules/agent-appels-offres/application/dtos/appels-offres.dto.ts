import { z } from 'zod';

export const TenderLeadInputSchema = z.object({
  boamp_reference: z.string().min(1, 'BOAMP reference is required'),
  source_url: z.string().url('Invalid source URL'),
  acheteur: z.string().min(1, 'Acheteur is required'),
  objet: z.string().min(1, 'Objet is required'),
  type_procedure: z.string().optional(),
  montant_estime: z.number().positive().optional(),
  date_deadline: z.string().datetime({ offset: true }).optional(),
  dce_urls: z.array(z.string().url()).default([]),
  score_lead: z.number().min(0).max(100).optional(),
  mots_cles: z.array(z.string()).default([]),
});

export type TenderLeadInput = z.infer<typeof TenderLeadInputSchema>;

export const AnalyzeTenderSchema = z.object({
  tenderId: z.string().uuid('tenderId must be a valid UUID'),
  forceReanalyze: z.boolean().default(false),
});

export type AnalyzeTenderDto = z.infer<typeof AnalyzeTenderSchema>;

export const QualificationDecisionSchema = z.object({
  decision: z.enum(['GO', 'POSSIBLE', 'NO_GO']),
  reason: z.string().optional(),
  jonathanDecision: z.boolean().optional(),
});

export type QualificationDecisionDto = z.infer<typeof QualificationDecisionSchema>;
