import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MODEL_PRICING } from './llm.types';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

@Injectable()
export class CostTrackerService implements OnModuleDestroy {
  private readonly logger = new Logger(CostTrackerService.name);
  private readonly redis: InstanceType<typeof Redis>;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis connection error in CostTracker', error: err.message });
    });
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }

  async checkBudget(): Promise<boolean> {
    const dailyLimit = this.configService.get<number>('llm.dailyBudgetEur', 25);
    const monthlyLimit = this.configService.get<number>('llm.monthlyBudgetEur', 500);

    const dailySpend = await this.getDailySpend();
    const monthlySpend = await this.getMonthlySpend();

    if (dailySpend >= dailyLimit) {
      this.logger.warn(
        { dailySpend, limit: dailyLimit },
        'Daily LLM budget exceeded',
      );
      return false;
    }
    if (monthlySpend >= monthlyLimit) {
      this.logger.warn(
        { monthlySpend, limit: monthlyLimit },
        'Monthly LLM budget exceeded',
      );
      return false;
    }
    return true;
  }

  async record(model: string, inputTokens: number, outputTokens: number): Promise<number> {
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    const dailyKey = `cost:daily:${new Date().toISOString().slice(0, 10)}`;
    await this.redis.incrbyfloat(dailyKey, cost);
    await this.redis.expire(dailyKey, 86400 * 2);

    const monthlyKey = `cost:monthly:${new Date().toISOString().slice(0, 7)}`;
    await this.redis.incrbyfloat(monthlyKey, cost);
    await this.redis.expire(monthlyKey, 86400 * 35);

    return cost;
  }

  async getDailySpend(): Promise<number> {
    const dailyKey = `cost:daily:${new Date().toISOString().slice(0, 10)}`;
    const val = await this.redis.get(dailyKey);
    return val ? parseFloat(val) : 0;
  }

  async getMonthlySpend(): Promise<number> {
    const monthlyKey = `cost:monthly:${new Date().toISOString().slice(0, 7)}`;
    const val = await this.redis.get(monthlyKey);
    return val ? parseFloat(val) : 0;
  }

  async getSpend(): Promise<{ daily: number; monthly: number }> {
    const [daily, monthly] = await Promise.all([this.getDailySpend(), this.getMonthlySpend()]);
    return { daily, monthly };
  }
}
