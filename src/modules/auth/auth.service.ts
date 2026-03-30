import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { RegisterDto, LoginDto } from './dtos/auth.dto';

// Constant-time dummy hash used when user is not found to prevent timing-based user enumeration
const DUMMY_HASH = '$2b$12$LJ3m4ys3GZfnMZBqFYMz3uKPgRWlez6JX4q/cvISrVqpq1VPYf9Ku';

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private static readonly SALT_ROUNDS = 12;
  private readonly redis: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.redis = new Redis(configService.getOrThrow<string>('REDIS_URL'));
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, AuthService.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles: ['user'],
      },
    });

    this.logger.log({ msg: 'User registered', userId: user.id, email: user.email });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await bcrypt.compare(dto.password, hash);

    if (user && user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked');
    }

    if (!user || !user.isActive || !isValid) {
      if (user) {
        const newFailedAttempts = user.failedLoginAttempts + 1;
        const lockData: { failedLoginAttempts: number; lockedUntil?: Date } = {
          failedLoginAttempts: newFailedAttempts,
        };
        if (newFailedAttempts >= 5) {
          lockData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
        await this.prisma.user.update({ where: { id: user.id }, data: lockData });
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });

    this.logger.log({ msg: 'User logged in', userId: user.id });

    return this.generateTokens(user);
  }

  async validateRefreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (!payload.jti || !(await this.redis.get('refresh:' + payload.jti))) {
        throw new UnauthorizedException('Refresh token already used or revoked');
      }
      await this.redis.del('refresh:' + payload.jti);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(user: { id: string; email: string; roles: string[] }) {
    const payload = { sub: user.id, email: user.email, roles: user.roles };
    const accessToken = await this.jwtService.signAsync(payload);
    const jti = randomUUID();
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, jti },
      { expiresIn: '7d' },
    );
    await this.redis.set('refresh:' + jti, user.id, 'EX', REFRESH_TOKEN_TTL_SECONDS);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: '15m',
    };
  }
}
