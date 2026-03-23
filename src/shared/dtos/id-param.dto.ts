import { z } from 'zod';

export const UuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export type UuidParamDto = z.infer<typeof UuidParamSchema>;
