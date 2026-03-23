import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClaudeAdapter } from './claude.adapter';
import { ClaudeApiUnavailableException } from '@common/exceptions/claude-api-unavailable.exception';

const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockMessagesCreate,
      },
    })),
  };
});

describe('ClaudeAdapter', () => {
  let adapter: ClaudeAdapter;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-api-key'),
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClaudeAdapter, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    adapter = module.get<ClaudeAdapter>(ClaudeAdapter);
  });

  describe('complete()', () => {
    it('returns correct LlmCompletionResponse structure', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello from Claude' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-haiku-3-5-20241022',
        stop_reason: 'end_turn',
      });

      const result = await adapter.complete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result).toEqual({
        content: 'Hello from Claude',
        inputTokens: 100,
        outputTokens: 50,
        model: 'claude-haiku-3-5-20241022',
        stopReason: 'end_turn',
      });
    });

    it('filters out system role from messages', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      });

      await adapter.complete({
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      });

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe('user');
    });

    it('uses systemPrompt parameter separately', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      });

      await adapter.complete({
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: 'Be concise',
      });

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.system).toBe('Be concise');
    });

    it('throws ClaudeApiUnavailableException on API error', async () => {
      mockMessagesCreate.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        adapter.complete({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(ClaudeApiUnavailableException);
    });

    it('uses default model when not specified', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      });

      await adapter.complete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
    });

    it('uses specified model when provided', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-haiku-3-5-20241022',
        stop_reason: 'end_turn',
      });

      await adapter.complete({
        model: 'claude-haiku-3-5-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-haiku-3-5-20241022');
    });
  });

  describe('isAvailable()', () => {
    it('returns true on success', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'pong' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        model: 'claude-haiku-3-5-20241022',
        stop_reason: 'end_turn',
      });

      const result = await adapter.isAvailable();
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockMessagesCreate.mockRejectedValueOnce(new Error('API error'));

      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });
});
