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
