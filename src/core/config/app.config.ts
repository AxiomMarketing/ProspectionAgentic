import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const appSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  allowedOrigins: z.string().transform((s) => s.split(',').map((o) => o.trim())),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof appSchema>;

export default registerAs('app', (): AppConfig => {
  return appSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.APP_PORT,
    allowedOrigins: process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000',
    logLevel: process.env.LOG_LEVEL,
  });
});
