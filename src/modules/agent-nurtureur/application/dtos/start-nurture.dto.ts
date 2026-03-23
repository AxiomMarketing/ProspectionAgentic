import { z } from 'zod';

export const StartNurtureSchema = z.object({
  prospectId: z.string().uuid(),
  reason: z.string(),
});

export type StartNurtureDto = z.infer<typeof StartNurtureSchema>;
