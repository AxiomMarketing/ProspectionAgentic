import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Core modules
import { DatabaseModule } from '@core/database/database.module';
import { LoggerModule } from '@core/logger/logger.module';
import { HealthModule } from '@core/health/health.module';
import { AgentSchedulerModule } from '@core/scheduler/scheduler.module';

// Config factories
import appConfig from '@core/config/app.config';
import databaseConfig from '@core/config/database.config';
import redisConfig from '@core/config/redis.config';
import llmConfig from '@core/config/llm.config';
import jwtConfig from '@core/config/jwt.config';
import enrichmentConfig from '@core/config/enrichment.config';
import csmConfig from '@core/config/csm.config';

// Common module
import { CommonModule } from '@common/common.module';
import { SharedModule } from '@shared/shared.module';

// Guards
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';

// Auth module
import { AuthModule } from '@modules/auth/auth.module';

// Agent modules
import { AgentVeilleurModule } from '@modules/agent-veilleur/agent-veilleur.module';
import { AgentEnrichisseurModule } from '@modules/agent-enrichisseur/agent-enrichisseur.module';
import { AgentScoreurModule } from '@modules/agent-scoreur/agent-scoreur.module';
import { AgentRedacteurModule } from '@modules/agent-redacteur/agent-redacteur.module';
import { AgentSuiveurModule } from '@modules/agent-suiveur/agent-suiveur.module';
import { AgentNurtureurModule } from '@modules/agent-nurtureur/agent-nurtureur.module';
import { AgentAnalysteModule } from '@modules/agent-analyste/agent-analyste.module';
import { AgentDealmakerModule } from '@modules/agent-dealmaker/agent-dealmaker.module';
import { AgentAppelsOffresModule } from '@modules/agent-appels-offres/agent-appels-offres.module';
import { AgentCsmModule } from '@modules/agent-csm/agent-csm.module';

// LLM module
import { LlmModule } from '@modules/llm/llm.module';

// Email module
import { EmailModule } from '@modules/email/email.module';

// Functional modules
import { ProspectsModule } from '@modules/prospects/prospects.module';
import { DashboardModule } from '@modules/dashboard/dashboard.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, redisConfig, llmConfig, jwtConfig, enrichmentConfig, csmConfig],
    }),

    // Logging (Pino)
    LoggerModule,

    // Event emitter for domain events
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // BullMQ (job queues)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        const connection = redisUrl
          ? { url: redisUrl }
          : {
              host: configService.get<string>('redis.host', 'localhost'),
              port: configService.get<number>('redis.port', 6379),
              password: configService.get<string>('redis.password'),
            };
        return {
          connection,
          defaultJobOptions: {
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        };
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60000, limit: 100 },
      { name: 'long', ttl: 3600000, limit: 1000 },
    ]),

    // Core
    DatabaseModule,
    HealthModule,
    CommonModule,
    SharedModule,
    AgentSchedulerModule,

    // Auth
    AuthModule,

    // Agent modules
    AgentVeilleurModule,
    AgentEnrichisseurModule,
    AgentScoreurModule,
    AgentRedacteurModule,
    AgentSuiveurModule,
    AgentNurtureurModule,
    AgentAnalysteModule,
    AgentDealmakerModule,
    AgentAppelsOffresModule,
    AgentCsmModule,

    // LLM
    LlmModule,

    // Email
    EmailModule,

    // Functional modules
    ProspectsModule,
    DashboardModule,
  ],
  providers: [
    // Global guards (execution order: Throttler → JWT → Roles)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
