import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

export const CACHE_TTL = {
  INSEE: 2_592_000,   // 30 days
  PAPPERS: 2_592_000, // 30 days
  INPI: 2_592_000,    // 30 days
  BODACC: 604_800,    // 7 days
  CONTACT: 604_800,   // 7 days
} as const;

@Injectable()
export class EnrichmentCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(EnrichmentCacheService.name);
  private readonly redis: InstanceType<typeof Redis>;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis connection error', error: err.message });
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        this.logger.debug({ msg: 'Cache miss', key });
        return null;
      }
      this.logger.debug({ msg: 'Cache hit', key });
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn({ msg: 'Cache get failed', key, error: (error as Error).message });
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      this.logger.debug({ msg: 'Cache set', key, ttlSeconds });
    } catch (error) {
      this.logger.warn({ msg: 'Cache set failed', key, error: (error as Error).message });
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.debug({ msg: 'Cache invalidated', key });
    } catch (error) {
      this.logger.warn({ msg: 'Cache invalidate failed', key, error: (error as Error).message });
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
