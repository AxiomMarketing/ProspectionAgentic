import { Module } from '@nestjs/common';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { LlmService } from './llm.service';
import { CostTrackerService } from './cost-tracker.service';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';

@Module({
  providers: [{ provide: ILlmAdapter, useClass: ClaudeAdapter }, CostTrackerService, LlmService],
  exports: [LlmService, ILlmAdapter, CostTrackerService],
})
export class LlmModule {}
