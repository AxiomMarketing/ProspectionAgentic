export enum LlmTask {
  // Haiku: fast classification tasks
  CLASSIFY_REPLY = 'classify_reply',
  EXTRACT_CONTACT_INFO = 'extract_contact_info',
  VALIDATE_EMAIL = 'validate_email',
  SCORE_PROSPECT = 'score_prospect',
  DETECT_LANGUAGE = 'detect_language',

  // Sonnet: generation tasks
  GENERATE_EMAIL = 'generate_email',
  GENERATE_LINKEDIN_MESSAGE = 'generate_linkedin_message',
  PERSONALIZE_TEMPLATE = 'personalize_template',
  SUGGEST_NEXT_ACTION = 'suggest_next_action',

  // Opus: complex analysis
  ANALYZE_DCE = 'analyze_dce',
  ANALYZE_COMPANY_STRATEGY = 'analyze_company_strategy',
  REVIEW_CONTRACT = 'review_contract',
}

export const MODEL_ROUTING: Record<LlmTask, string> = {
  [LlmTask.CLASSIFY_REPLY]: 'claude-haiku-3-5-20241022',
  [LlmTask.EXTRACT_CONTACT_INFO]: 'claude-haiku-3-5-20241022',
  [LlmTask.VALIDATE_EMAIL]: 'claude-haiku-3-5-20241022',
  [LlmTask.SCORE_PROSPECT]: 'claude-haiku-3-5-20241022',
  [LlmTask.DETECT_LANGUAGE]: 'claude-haiku-3-5-20241022',
  [LlmTask.GENERATE_EMAIL]: 'claude-sonnet-4-20250514',
  [LlmTask.GENERATE_LINKEDIN_MESSAGE]: 'claude-sonnet-4-20250514',
  [LlmTask.PERSONALIZE_TEMPLATE]: 'claude-sonnet-4-20250514',
  [LlmTask.SUGGEST_NEXT_ACTION]: 'claude-sonnet-4-20250514',
  [LlmTask.ANALYZE_DCE]: 'claude-opus-4-20250514',
  [LlmTask.ANALYZE_COMPANY_STRATEGY]: 'claude-opus-4-20250514',
  [LlmTask.REVIEW_CONTRACT]: 'claude-opus-4-20250514',
};

// Pricing per 1M tokens in EUR
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
};

export interface LlmCallOptions {
  task: LlmTask;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCallResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  durationMs: number;
}
