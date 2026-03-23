import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MODEL_PRICING } from './llm.types';

@Injectable()
export class CostTrackerService {
  private readonly logger = new Logger(CostTrackerService.name);
  private dailySpend = 0;
  private monthlySpend = 0;
  private lastResetDay = new Date().toISOString().split('T')[0];
  private lastResetMonth = new Date().toISOString().substring(0, 7);

  constructor(private readonly configService: ConfigService) {}

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }

  checkBudget(): boolean {
    this.resetIfNeeded();
    const dailyLimit = this.configService.get<number>('llm.dailyBudgetEur', 25);
    const monthlyLimit = this.configService.get<number>('llm.monthlyBudgetEur', 500);

    if (this.dailySpend >= dailyLimit) {
      this.logger.warn(
        { dailySpend: this.dailySpend, limit: dailyLimit },
        'Daily LLM budget exceeded',
      );
      return false;
    }
    if (this.monthlySpend >= monthlyLimit) {
      this.logger.warn(
        { monthlySpend: this.monthlySpend, limit: monthlyLimit },
        'Monthly LLM budget exceeded',
      );
      return false;
    }
    return true;
  }

  record(model: string, inputTokens: number, outputTokens: number): number {
    this.resetIfNeeded();
    const cost = this.calculateCost(model, inputTokens, outputTokens);
    this.dailySpend += cost;
    this.monthlySpend += cost;
    return cost;
  }

  getSpend(): { daily: number; monthly: number } {
    this.resetIfNeeded();
    return { daily: this.dailySpend, monthly: this.monthlySpend };
  }

  private resetIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().toISOString().substring(0, 7);
    if (today !== this.lastResetDay) {
      this.dailySpend = 0;
      this.lastResetDay = today;
    }
    if (month !== this.lastResetMonth) {
      this.monthlySpend = 0;
      this.lastResetMonth = month;
    }
  }
}
