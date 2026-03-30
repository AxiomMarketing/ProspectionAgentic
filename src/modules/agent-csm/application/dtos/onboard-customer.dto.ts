import { z } from 'zod';

export const OnboardCustomerSchema = z.object({
  companyName: z.string().min(1),
  siren: z.string().length(9).optional(),
  primaryContactId: z.string().uuid().optional(),
  contractStartDate: z.string().datetime().optional(),
  mrrEur: z.number().positive(),
  plan: z.string().optional(),
});

export type OnboardCustomerDto = z.infer<typeof OnboardCustomerSchema>;

export const ReferralSubmitSchema = z.object({
  prenom: z.string().min(1).max(100),
  nom: z.string().min(1).max(100),
  email: z.string().email(),
  entreprise: z.string().min(1).max(200),
  besoin: z.string().min(1).max(1000),
  telephone: z.string().max(20).optional(),
});
export type ReferralSubmitDto = z.infer<typeof ReferralSubmitSchema>;

export const UpdateCustomerSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'onboarding', 'churned', 'suspended']).optional(),
  tier: z.enum(['bronze', 'silver', 'gold']).optional(),
  mrrEur: z.number().nonnegative().optional(),
  plan: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
}).strict();
export type UpdateCustomerDto = z.infer<typeof UpdateCustomerSchema>;
