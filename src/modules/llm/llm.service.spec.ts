import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';
import { CostTrackerService } from './cost-tracker.service';
import { MockLlmAdapter } from './adapters/mock-llm.adapter';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';
import { LlmTask } from './llm.types';

describe('LlmService', () => {
  let service: LlmService;
  let mockAdapter: MockLlmAdapter;
  let costTracker: CostTrackerService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: number) => {
      if (key === 'llm.dailyBudgetEur') return 25;
      if (key === 'llm.monthlyBudgetEur') return 500;
      return defaultVal;
    }),
  };

  beforeEach(async () => {
    mockAdapter = new MockLlmAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        CostTrackerService,
        { provide: ILlmAdapter, useValue: mockAdapter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    costTracker = module.get<CostTrackerService>(CostTrackerService);
  });

  describe('call()', () => {
    it('routes CLASSIFY_REPLY task to haiku model', async () => {
      await service.call({
        task: LlmTask.CLASSIFY_REPLY,
        systemPrompt: 'Classify this email',
        userPrompt: 'I am interested',
      });

      const log = mockAdapter.getCallLog();
      expect(log).toHaveLength(1);
      expect(log[0].model).toBe('claude-haiku-3-5-20241022');
    });

    it('routes GENERATE_EMAIL task to sonnet model', async () => {
      await service.call({
        task: LlmTask.GENERATE_EMAIL,
        systemPrompt: 'Write an email',
        userPrompt: 'Prospect info',
      });

      const log = mockAdapter.getCallLog();
      expect(log).toHaveLength(1);
      expect(log[0].model).toBe('claude-sonnet-4-20250514');
    });

    it('records cost after successful call', async () => {
      const spendBefore = costTracker.getSpend();
      expect(spendBefore.daily).toBe(0);

      await service.call({
        task: LlmTask.CLASSIFY_REPLY,
        systemPrompt: 'Classify',
        userPrompt: 'Hello',
      });

      // MockLlmAdapter returns 10 input + 5 output tokens
      const spendAfter = costTracker.getSpend();
      expect(spendAfter.daily).toBeGreaterThan(0);
    });

    it('returns correct LlmCallResult structure', async () => {
      mockAdapter.setDefaultResponse('classified: positive');

      const result = await service.call({
        task: LlmTask.CLASSIFY_REPLY,
        systemPrompt: 'Classify',
        userPrompt: 'I am interested',
      });

      expect(result).toMatchObject({
        content: 'classified: positive',
        model: 'mock-model',
        inputTokens: 10,
        outputTokens: 5,
      });
      expect(result.costEur).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('throws when budget exceeded', async () => {
      // Exhaust daily budget (25 EUR)
      // haiku: 1M input = 0.8 EUR, need 32 iterations
      for (let i = 0; i < 32; i++) {
        costTracker.record('claude-haiku-3-5-20241022', 1_000_000, 0);
      }

      await expect(
        service.call({
          task: LlmTask.CLASSIFY_REPLY,
          systemPrompt: 'Classify',
          userPrompt: 'Hello',
        }),
      ).rejects.toThrow('LLM budget exceeded');
    });

    it('passes systemPrompt and userPrompt to adapter', async () => {
      await service.call({
        task: LlmTask.CLASSIFY_REPLY,
        systemPrompt: 'System instruction',
        userPrompt: 'User message',
      });

      const log = mockAdapter.getCallLog();
      expect(log[0].systemPrompt).toBe('System instruction');
      expect(log[0].messages[0].content).toBe('User message');
    });
  });
});
