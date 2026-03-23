import { z } from 'zod';

export const EnrichProspectSchema = z.object({
  prospectId: z.string().uuid(),
});

export type EnrichProspectDto = z.infer<typeof EnrichProspectSchema>;
