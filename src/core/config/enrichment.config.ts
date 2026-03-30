import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const enrichmentSchema = z.object({
  reacherUrl: z.string().default('http://localhost:8080'),
  reacherMaxConcurrent: z.coerce.number().default(5),
  reacherTimeoutMs: z.coerce.number().default(30000),
  reacherMaxRequestsPerDay: z.coerce.number().default(500),
  inpiApiUrl: z.string().default('https://data.inpi.fr/api'),
  inpiUsername: z.string().optional(),
  inpiPassword: z.string().optional(),
});

export type EnrichmentConfig = z.infer<typeof enrichmentSchema>;

export default registerAs('enrichment', (): EnrichmentConfig => {
  return enrichmentSchema.parse({
    reacherUrl: process.env.REACHER_URL,
    reacherMaxConcurrent: process.env.REACHER_MAX_CONCURRENT,
    reacherTimeoutMs: process.env.REACHER_TIMEOUT_MS,
    reacherMaxRequestsPerDay: process.env.REACHER_MAX_REQUESTS_PER_DAY,
    inpiApiUrl: process.env.INPI_API_URL,
    inpiUsername: process.env.INPI_USERNAME,
    inpiPassword: process.env.INPI_PASSWORD,
  });
});
