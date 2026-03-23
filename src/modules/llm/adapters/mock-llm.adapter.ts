import { Injectable } from '@nestjs/common';
import {
  ILlmAdapter,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '@common/ports/i-llm.adapter';

@Injectable()
export class MockLlmAdapter extends ILlmAdapter {
  private responses = new Map<string, string>();
  private defaultResponse = '{"mock": true}';
  private callLog: LlmCompletionRequest[] = [];

  setResponse(prompt: string, response: string): void {
    this.responses.set(prompt, response);
  }

  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  getCallLog(): LlmCompletionRequest[] {
    return [...this.callLog];
  }

  clearCallLog(): void {
    this.callLog = [];
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.callLog.push(request);
    const lastMessage = request.messages[request.messages.length - 1]?.content ?? '';
    const content = this.responses.get(lastMessage) ?? this.defaultResponse;

    return {
      content,
      inputTokens: 10,
      outputTokens: 5,
      model: 'mock-model',
      stopReason: 'end_turn',
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
