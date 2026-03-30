import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const jwtSchema = z.object({
  secret: z.string().min(32).refine(
    (val) => process.env.NODE_ENV !== 'production' || (!val.includes('CHANGE_ME') && !val.startsWith('dev-')),
    { message: 'Production JWT_SECRET must not be a placeholder value' }
  ),
  expiration: z.string().default('15m'),
  refreshExpiration: z.string().default('7d'),
});

export type JwtConfig = z.infer<typeof jwtSchema>;

export default registerAs('jwt', (): JwtConfig => {
  return jwtSchema.parse({
    secret: process.env.JWT_SECRET,
    expiration: process.env.JWT_EXPIRATION,
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION,
  });
});
