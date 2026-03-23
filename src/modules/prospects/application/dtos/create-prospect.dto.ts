import { z } from 'zod';

export const CreateProspectSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  companyName: z.string().optional(),
  companySiren: z.string().regex(/^\d{9}$/).optional(),
  companyWebsite: z.string().url().optional(),
  jobTitle: z.string().optional(),
  seniorityLevel: z.string().optional(),
});

export type CreateProspectDto = z.infer<typeof CreateProspectSchema>;

export const UpdateProspectSchema = CreateProspectSchema.partial();
export type UpdateProspectDto = z.infer<typeof UpdateProspectSchema>;
