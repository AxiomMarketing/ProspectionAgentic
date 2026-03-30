import { z } from 'zod';

export const StartNurtureSchema = z.object({
  prospectId: z.string().uuid(),
  reason: z.string(),
  category: z.enum(['WARM', 'COLD']).optional(),
  segment: z.string().optional(),
  scoringCategorie: z.enum(['WARM', 'COLD']).optional(),
  engagementScoreInitial: z.number().min(0).optional(),
  sequenceType: z.enum(['WARM_NURTURE', 'COLD_NURTURE', 'PAS_MAINTENANT_NURTURE']).optional(),
  routing: z
    .object({
      sequenceId: z.string(),
      canal: z.string(),
      slaHours: z.number(),
      priority: z.number(),
      delayMs: z.number(),
    })
    .optional(),
});

export type StartNurtureDto = z.infer<typeof StartNurtureSchema>;

export const ProcessNurtureStepSchema = z.object({
  nurtureId: z.string().uuid(),
  prospectId: z.string().uuid(),
  step: z.number().int().min(0),
});

export type ProcessNurtureStepDto = z.infer<typeof ProcessNurtureStepSchema>;

export const NurtureJobPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start-nurture'),
    data: StartNurtureSchema,
  }),
  z.object({
    type: z.literal('process-step'),
    data: ProcessNurtureStepSchema,
  }),
]);

export type NurtureJobPayload = z.infer<typeof NurtureJobPayloadSchema>;
