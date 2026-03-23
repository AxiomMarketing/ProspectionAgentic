import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const redisSchema = z.object({
  url: z.string().optional(),
  host: z.string().default('localhost'),
  port: z.coerce.number().default(6379),
  password: z.string().optional(),
});

export type RedisConfig = z.infer<typeof redisSchema>;

export default registerAs('redis', (): RedisConfig => {
  return redisSchema.parse({
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  });
});
