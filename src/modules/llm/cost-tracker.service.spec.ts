import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CostTrackerService } from './cost-tracker.service';

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [CostTrackerService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<CostTrackerService>(CostTrackerService);
  });

  describe('calculateCost()', () => {
    it('calculates cost for haiku model: 1000 input + 500 output tokens', () => {
      // haiku: input=0.8/1M, output=4.0/1M
      // cost = (1000 * 0.8 + 500 * 4.0) / 1_000_000
      //      = (800 + 2000) / 1_000_000 = 0.0028
      const cost = service.calculateCost('claude-haiku-3-5-20241022', 1000, 500);
      expect(cost).toBeCloseTo(0.0028, 6);
    });

    it('calculates cost for sonnet model', () => {
      // sonnet: input=3.0/1M, output=15.0/1M
      // cost = (1000 * 3.0 + 500 * 15.0) / 1_000_000
      //      = (3000 + 7500) / 1_000_000 = 0.0105
      const cost = service.calculateCost('claude-sonnet-4-20250514', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('returns 0 for unknown model', () => {
      const cost = service.calculateCost('unknown-model', 1000, 500);
      expect(cost).toBe(0);
    });
  });

  describe('checkBudget()', () => {
    it('returns true when under limit', () => {
      expect(service.checkBudget()).toBe(true);
    });

    it('returns false when daily limit exceeded', async () => {
      // Record enough spend to exceed daily limit of 25 EUR
      // Use haiku model at 1M input tokens each time to accumulate spend
      // 1M input tokens at 0.8/1M = 0.8 EUR per call
      // Need 32 calls to exceed 25 EUR
      for (let i = 0; i < 32; i++) {
        service.record('claude-haiku-3-5-20241022', 1_000_000, 0);
      }
      expect(service.checkBudget()).toBe(false);
    });

    it('returns false when monthly limit exceeded', async () => {
      // Record enough spend to exceed monthly limit of 500 EUR
      // sonnet: 1M input tokens = 3.0 EUR, need 167 calls to exceed 500 EUR
      for (let i = 0; i < 170; i++) {
        service.record('claude-sonnet-4-20250514', 1_000_000, 0);
      }
      expect(service.checkBudget()).toBe(false);
    });
  });

  describe('record()', () => {
    it('accumulates costs across multiple calls', () => {
      service.record('claude-haiku-3-5-20241022', 1000, 500);
      service.record('claude-haiku-3-5-20241022', 1000, 500);
      const spend = service.getSpend();
      // Each call: (1000*0.8 + 500*4.0)/1M = 0.0028
      expect(spend.daily).toBeCloseTo(0.0028 * 2, 6);
      expect(spend.monthly).toBeCloseTo(0.0028 * 2, 6);
    });

    it('returns the cost of the recorded call', () => {
      const cost = service.record('claude-haiku-3-5-20241022', 1000, 500);
      expect(cost).toBeCloseTo(0.0028, 6);
    });
  });

  describe('getSpend()', () => {
    it('returns zero totals initially', () => {
      const spend = service.getSpend();
      expect(spend.daily).toBe(0);
      expect(spend.monthly).toBe(0);
    });

    it('returns current totals after recording', () => {
      service.record('claude-sonnet-4-20250514', 1000, 500);
      const spend = service.getSpend();
      expect(spend.daily).toBeGreaterThan(0);
      expect(spend.monthly).toBeGreaterThan(0);
      expect(spend.daily).toBe(spend.monthly);
    });
  });
});
