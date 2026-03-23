import { z } from 'zod';

export const CreateDealSchema = z.object({
  prospectId: z.string().uuid(),
  title: z.string().min(1),
  amountEur: z.number().positive().optional(),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
});

export type CreateDealDto = z.infer<typeof CreateDealSchema>;

export const GenerateQuoteSchema = z.object({
  dealId: z.string().uuid(),
  prospectId: z.string().uuid(),
  title: z.string().min(1),
  amountHtEur: z.number().positive(),
  tvaRate: z.number().min(0).max(1).default(0.2),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unitPriceEur: z.number().positive(),
  })).min(1),
});

export type GenerateQuoteDto = z.infer<typeof GenerateQuoteSchema>;
