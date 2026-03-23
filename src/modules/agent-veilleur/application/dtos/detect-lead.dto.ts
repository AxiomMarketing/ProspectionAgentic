import { z } from 'zod';

export const DetectLeadSchema = z.object({
  source: z.enum(['boamp', 'linkedin', 'web', 'job_board']),
  keywords: z.array(z.string()).min(1),
  maxResults: z.number().int().positive().max(100).default(20),
});

export type DetectLeadDto = z.infer<typeof DetectLeadSchema>;
