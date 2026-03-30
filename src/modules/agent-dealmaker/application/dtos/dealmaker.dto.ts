import { z } from 'zod';
import { DealStage } from '../../domain/entities/deal.entity';

export const CreateDealSchema = z.object({
  prospectId: z.string().uuid(),
  title: z.string().min(1),
  amountEur: z.number().positive().optional(),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
});

export type CreateDealDto = z.infer<typeof CreateDealSchema>;

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceEur: z.number().positive(),
});

export const GenerateQuoteSchema = z
  .object({
    dealId: z.string().uuid(),
    prospectId: z.string().uuid(),
    title: z.string().min(1),
    amountHtEur: z.number().positive().max(10_000_000),
    tvaRate: z.preprocess(
      (val) => (typeof val === 'string' ? parseFloat(val) : val),
      z.union([z.literal(0.055), z.literal(0.1), z.literal(0.2)]),
    ),
    description: z.string().min(1).optional(),
    lineItems: z.array(LineItemSchema).min(1),
    validityDays: z.number().int().positive().default(30),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      const lineItemsTotal = data.lineItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceEur,
        0,
      );
      return Math.abs(lineItemsTotal - data.amountHtEur) < 0.01;
    },
    {
      message: 'amountHtEur must equal the sum of lineItems (quantity * unitPriceEur)',
      path: ['amountHtEur'],
    },
  );

export type GenerateQuoteDto = z.infer<typeof GenerateQuoteSchema>;

export const AdvanceStageSchema = z.object({
  dealId: z.string().uuid().optional(),
  stage: z.nativeEnum(DealStage),
  reason: z.string().optional(),
});

export type AdvanceStageDto = z.infer<typeof AdvanceStageSchema>;

const RdvDecouverteSchema = z.object({
  date: z.string().datetime(),
  durationMinutes: z.number().int().positive().optional(),
  notes: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  typeProjet: z.string().optional(),
  budget: z.number().positive().optional(),
  decisionTimeline: z.string().optional(),
  painPoints: z.array(z.string()).optional(),
  competitors: z.array(z.string()).optional(),
});

export const DealmakerInputSchema = z.object({
  prospectId: z.string().uuid(),
  title: z.string().min(1),
  amountEur: z.number().positive().optional(),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  segment: z.string().optional(),
  canalPrincipal: z.string().optional(),
  typeProjet: z.string().optional(),
  tierRecommande: z.string().optional(),
  rdvDecouverte: RdvDecouverteSchema.optional(),
});

export type DealmakerInputDto = z.infer<typeof DealmakerInputSchema>;
