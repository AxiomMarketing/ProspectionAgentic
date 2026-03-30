import { z } from 'zod';

export const GenerateMessageSchema = z.object({
  prospectId: z.string().uuid(),
  channel: z.enum(['email', 'linkedin']),
  templateId: z.string().uuid().optional(),
  category: z.string().optional(),
  routing: z
    .object({
      sequenceId: z.string(),
      canal: z.string(),
      slaHours: z.number(),
      priority: z.number(),
      delayMs: z.number(),
    })
    .optional(),
  breakdown: z.record(z.number()).optional(),
});

export type GenerateMessageDto = z.infer<typeof GenerateMessageSchema>;
