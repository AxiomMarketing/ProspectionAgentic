import { Injectable, Logger } from '@nestjs/common';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';
import { CostTrackerService } from './cost-tracker.service';
import { LlmCallOptions, LlmCallResult, MODEL_ROUTING } from './llm.types';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly llmAdapter: ILlmAdapter,
    private readonly costTracker: CostTrackerService,
  ) {}

  async call(options: LlmCallOptions): Promise<LlmCallResult> {
    const model = MODEL_ROUTING[options.task];
    const startTime = Date.now();

    if (!(await this.costTracker.checkBudget())) {
      throw new Error('LLM budget exceeded');
    }

    this.logger.log({ msg: 'LLM call', task: options.task, model });

    const response = await this.llmAdapter.complete({
      model,
      messages: [{ role: 'user', content: options.userPrompt }],
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    const costEur = await this.costTracker.record(model, response.inputTokens, response.outputTokens);
    const durationMs = Date.now() - startTime;

    this.logger.log({
      msg: 'LLM call complete',
      task: options.task,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costEur: costEur.toFixed(6),
      durationMs,
    });

    return {
      content: response.content,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costEur,
      durationMs,
    };
  }
}
