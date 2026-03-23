export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmCompletionRequest {
  model?: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  cacheablePrefix?: string;
}

export interface LlmCompletionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: string;
}

export abstract class ILlmAdapter {
  abstract complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  abstract isAvailable(): Promise<boolean>;
}
