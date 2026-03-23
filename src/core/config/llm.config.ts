import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const llmSchema = z.object({
  anthropicApiKey: z.string().default(''),
  monthlyBudgetEur: z.coerce.number().default(500),
  dailyBudgetEur: z.coerce.number().default(25),
});

export type LlmConfig = z.infer<typeof llmSchema>;

export default registerAs('llm', (): LlmConfig => {
  return llmSchema.parse({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    monthlyBudgetEur: process.env.LLM_MONTHLY_BUDGET_EUR,
    dailyBudgetEur: process.env.LLM_DAILY_BUDGET_EUR,
  });
});
