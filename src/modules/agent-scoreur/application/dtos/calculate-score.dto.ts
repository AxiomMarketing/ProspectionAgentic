import { z } from 'zod';

export const CalculateScoreSchema = z.object({
  prospectId: z.string().uuid(),
});

export type CalculateScoreDto = z.infer<typeof CalculateScoreSchema>;
