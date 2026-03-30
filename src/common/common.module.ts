import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  providers: [JwtAuthGuard, ApiKeyGuard, RolesGuard],
  exports: [JwtAuthGuard, ApiKeyGuard, RolesGuard],
})
export class CommonModule {}
