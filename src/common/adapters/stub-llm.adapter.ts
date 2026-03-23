import { Injectable, Logger } from '@nestjs/common';
import {
  ILlmAdapter,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '@common/ports/i-llm.adapter';

@Injectable()
export class StubLlmAdapter extends ILlmAdapter {
  private readonly logger = new Logger(StubLlmAdapter.name);

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.logger.warn({
      msg: 'StubLlmAdapter: LLM not configured, returning placeholder response',
      model: request.model,
    });
    return {
      content: '[LLM stub response — configure ANTHROPIC_API_KEY]',
      inputTokens: 0,
      outputTokens: 0,
      model: request.model ?? 'stub',
      stopReason: 'stub',
    };
  }

  async isAvailable(): Promise<boolean> {
    this.logger.warn('StubLlmAdapter: LLM not available — stub adapter in use');
    return false;
  }
}
