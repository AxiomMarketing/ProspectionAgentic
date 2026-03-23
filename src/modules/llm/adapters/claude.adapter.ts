import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  ILlmAdapter,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '@common/ports/i-llm.adapter';
import { ClaudeApiUnavailableException } from '@common/exceptions/claude-api-unavailable.exception';

@Injectable()
export class ClaudeAdapter extends ILlmAdapter {
  private readonly logger = new Logger(ClaudeAdapter.name);
  private readonly client: Anthropic;

  constructor(private readonly configService: ConfigService) {
    super();
    this.client = new Anthropic({
      apiKey: this.configService.getOrThrow<string>('llm.anthropicApiKey'),
      maxRetries: 2,
      timeout: 60_000,
    });
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model ?? 'claude-sonnet-4-20250514';

    const messages: Anthropic.MessageParam[] = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.3,
        ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
        messages,
      });

      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      return {
        content: textBlock.text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: response.model,
        stopReason: response.stop_reason ?? 'end_turn',
      };
    } catch (error) {
      if (error instanceof ClaudeApiUnavailableException) throw error;
      this.logger.error({ msg: 'Claude API call failed', error: (error as Error).message, model });
      throw new ClaudeApiUnavailableException((error as Error).message);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-3-5-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
