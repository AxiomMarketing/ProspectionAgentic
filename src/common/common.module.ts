import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RolesGuard } from './guards/roles.guard';
import { ILlmAdapter } from './ports/i-llm.adapter';
import { IEmailAdapter } from './ports/i-email.adapter';
import { IMarketDataAdapter } from './ports/i-market-data.adapter';
import { StubLlmAdapter } from './adapters/stub-llm.adapter';
import { StubEmailAdapter } from './adapters/stub-email.adapter';
import { StubMarketDataAdapter } from './adapters/stub-market-data.adapter';

@Global()
@Module({
  providers: [
    JwtAuthGuard,
    ApiKeyGuard,
    RolesGuard,
    { provide: ILlmAdapter, useClass: StubLlmAdapter },
    { provide: IEmailAdapter, useClass: StubEmailAdapter },
    { provide: IMarketDataAdapter, useClass: StubMarketDataAdapter },
  ],
  exports: [JwtAuthGuard, ApiKeyGuard, RolesGuard, ILlmAdapter, IEmailAdapter, IMarketDataAdapter],
})
export class CommonModule {}
