import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const dbSchema = z.object({
  url: z.string().url(),
});

export type DatabaseConfig = z.infer<typeof dbSchema>;

export default registerAs('database', (): DatabaseConfig => {
  return dbSchema.parse({
    url: process.env.DATABASE_URL,
  });
});
