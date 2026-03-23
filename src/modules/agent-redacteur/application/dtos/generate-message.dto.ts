import { z } from 'zod';

export const GenerateMessageSchema = z.object({
  prospectId: z.string().uuid(),
  channel: z.enum(['email', 'linkedin']),
  templateId: z.string().uuid().optional(),
});

export type GenerateMessageDto = z.infer<typeof GenerateMessageSchema>;
