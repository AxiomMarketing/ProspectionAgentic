import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { MockLlmAdapter } from './adapters/mock-llm.adapter';
import { LlmService } from './llm.service';
import { CostTrackerService } from './cost-tracker.service';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';

@Module({
  providers: [
    {
      provide: ILlmAdapter,
      useFactory: (configService: ConfigService) => {
        const apiKey = configService.get<string>('llm.anthropicApiKey', '');
        if (apiKey) {
          return new ClaudeAdapter(configService);
        }
        const mock = new MockLlmAdapter();
        mock.setDefaultResponse('{"mock": true, "note": "ANTHROPIC_API_KEY not configured"}');
        return mock;
      },
      inject: [ConfigService],
    },
    CostTrackerService,
    LlmService,
  ],
  exports: [LlmService, ILlmAdapter, CostTrackerService],
})
export class LlmModule {}
