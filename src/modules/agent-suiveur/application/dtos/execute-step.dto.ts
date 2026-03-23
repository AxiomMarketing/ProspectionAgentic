import { z } from 'zod';

export const ExecuteStepSchema = z.object({
  prospectId: z.string().uuid(),
  sequenceId: z.string().uuid(),
});

export type ExecuteStepDto = z.infer<typeof ExecuteStepSchema>;
