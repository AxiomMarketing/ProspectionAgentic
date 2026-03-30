import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CostTrackerService } from './cost-tracker.service';

// Mock ioredis to avoid needing a real Redis connection in unit tests
const redisStore: Record<string, number> = {};
const resetRedisStore = () => { Object.keys(redisStore).forEach((k) => delete redisStore[k]); };

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(async (key: string) => {
      const v = redisStore[key];
      return v !== undefined ? String(v) : null;
    }),
    incrbyfloat: jest.fn(async (key: string, delta: number) => {
      redisStore[key] = (redisStore[key] ?? 0) + delta;
      return redisStore[key];
    }),
    expire: jest.fn(async () => 1),
  }));
  (MockRedis as any).default = MockRedis;
  return MockRedis;
});

describe('CostTrackerService', () => {
  let service: CostTrackerService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: number) => {
      if (key === 'llm.dailyBudgetEur') return 25;
      if (key === 'llm.monthlyBudgetEur') return 500;
      return defaultVal;
    }),
  };

  beforeEach(async () => {
    resetRedisStore();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CostTrackerService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<CostTrackerService>(CostTrackerService);
  });

  describe('calculateCost()', () => {
    it('calculates cost for haiku model: 1000 input + 500 output tokens', () => {
      const cost = service.calculateCost('claude-haiku-3-5-20241022', 1000, 500);
      expect(cost).toBeCloseTo(0.0028, 6);
    });

    it('calculates cost for sonnet model', () => {
      const cost = service.calculateCost('claude-sonnet-4-20250514', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('returns 0 for unknown model', () => {
      const cost = service.calculateCost('unknown-model', 1000, 500);
      expect(cost).toBe(0);
    });
  });

  describe('checkBudget()', () => {
    it('returns true when under limit', async () => {
      expect(await service.checkBudget()).toBe(true);
    });

    it('returns false when daily limit exceeded', async () => {
      for (let i = 0; i < 32; i++) {
        await service.record('claude-haiku-3-5-20241022', 1_000_000, 0);
      }
      expect(await service.checkBudget()).toBe(false);
    });

    it('returns false when monthly limit exceeded', async () => {
      for (let i = 0; i < 170; i++) {
        await service.record('claude-sonnet-4-20250514', 1_000_000, 0);
      }
      expect(await service.checkBudget()).toBe(false);
    });
  });

  describe('record()', () => {
    it('accumulates costs across multiple calls', async () => {
      await service.record('claude-haiku-3-5-20241022', 1000, 500);
      await service.record('claude-haiku-3-5-20241022', 1000, 500);
      const spend = await service.getSpend();
      expect(spend.daily).toBeCloseTo(0.0028 * 2, 6);
      expect(spend.monthly).toBeCloseTo(0.0028 * 2, 6);
    });

    it('returns the cost of the recorded call', async () => {
      const cost = await service.record('claude-haiku-3-5-20241022', 1000, 500);
      expect(cost).toBeCloseTo(0.0028, 6);
    });
  });

  describe('getSpend()', () => {
    it('returns zero totals initially', async () => {
      const spend = await service.getSpend();
      expect(spend.daily).toBe(0);
      expect(spend.monthly).toBe(0);
    });

    it('returns current totals after recording', async () => {
      await service.record('claude-sonnet-4-20250514', 1000, 500);
      const spend = await service.getSpend();
      expect(spend.daily).toBeGreaterThan(0);
      expect(spend.monthly).toBeGreaterThan(0);
      expect(spend.daily).toBe(spend.monthly);
    });
  });
});
