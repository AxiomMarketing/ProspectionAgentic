import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RolesGuard } from './guards/roles.guard';
import { IEmailAdapter } from './ports/i-email.adapter';
import { StubEmailAdapter } from './adapters/stub-email.adapter';

@Global()
@Module({
  providers: [
    JwtAuthGuard,
    ApiKeyGuard,
    RolesGuard,
    { provide: IEmailAdapter, useClass: StubEmailAdapter },
  ],
  exports: [JwtAuthGuard, ApiKeyGuard, RolesGuard, IEmailAdapter],
})
export class CommonModule {}
