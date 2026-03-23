# Implementation Plan: NestJS Hexagonal Project Setup

## Overview
Create the complete NestJS 11 project from scratch with hexagonal architecture, Docker Compose (8 services), Prisma schema (23 tables, 8 enums), BullMQ queues, guards, interceptors, filters, adapter ports, and skeleton modules for all 10 agents + support modules.

## Task Groups (for Agent Teams parallel execution)

### Task 1: Project Scaffolding (no deps)
**Files:**
- `package.json` — NestJS 11.1.17, Prisma 7.4, BullMQ 5.71, Pino 10.3, Zod, etc.
- `tsconfig.json` — ES2022, CommonJS, strict, path aliases @core/@common/@shared/@modules
- `tsconfig.build.json` — exclude tests/dist
- `nest-cli.json` — compilerOptions, sourceRoot
- `.gitignore` — node_modules, dist, .env, prisma/*.db
- `.env.example` — All env vars documented
- `.eslintrc.js` — NestJS + TypeScript rules
- `.prettierrc` — singleQuote, trailingComma all

### Task 2: Docker Infrastructure (no deps)
**Files:**
- `docker-compose.yml` — 8 services: app, postgres, redis, n8n, langfuse, metabase, bull-board, caddy
- `Dockerfile` — Multi-stage (builder + production), non-root user
- `infrastructure/caddy/Caddyfile` — Reverse proxy with security headers, IP allowlists
- `infrastructure/postgres/init.sql` — Create 4 databases, extensions, roles
- `infrastructure/postgres/postgresql.conf` — Tuned for 8GB RAM

### Task 3: Prisma Schema (depends on Task 1)
**Files:**
- `prisma/schema.prisma` — 23 models, 8 enums, relations, indexes
- `prisma/seed.ts` — Initial data (scoring coefficients, message templates)

### Task 4: Core Modules (depends on Task 1)
**Files:**
- `src/core/config/app.config.ts` — Zod-validated config factory
- `src/core/config/database.config.ts`
- `src/core/config/redis.config.ts`
- `src/core/config/llm.config.ts`
- `src/core/database/prisma.service.ts` — OnModuleInit/OnModuleDestroy
- `src/core/database/database.module.ts` — @Global
- `src/core/logger/pino.config.ts` — PII redaction, structured JSON
- `src/core/logger/logger.module.ts`
- `src/core/health/health.controller.ts` — Terminus checks
- `src/core/health/health.module.ts`

### Task 5: Common Guards & Decorators (depends on Task 4)
**Files:**
- `src/common/guards/jwt-auth.guard.ts` — Extends AuthGuard('jwt'), @Public() check
- `src/common/guards/api-key.guard.ts` — X-API-Key or Bearer header
- `src/common/guards/roles.guard.ts` — @Roles() metadata check
- `src/common/decorators/public.decorator.ts` — SetMetadata(IS_PUBLIC_KEY)
- `src/common/decorators/roles.decorator.ts` — SetMetadata(ROLES_KEY)
- `src/common/decorators/current-user.decorator.ts` — createParamDecorator
- `src/common/decorators/timeout.decorator.ts`
- `src/common/decorators/cache-ttl.decorator.ts`
- `src/common/decorators/langfuse-trace.decorator.ts`

### Task 6: Common Interceptors, Filters, Pipes (depends on Task 4)
**Files:**
- `src/common/interceptors/logging.interceptor.ts` — Pino, requestId, duration
- `src/common/interceptors/transform.interceptor.ts` — Wrap { success, data, meta }
- `src/common/interceptors/timeout.interceptor.ts` — 30s default, @Timeout() override
- `src/common/interceptors/cache.interceptor.ts` — Redis GET caching
- `src/common/interceptors/langfuse.interceptor.ts` — LLM trace creation
- `src/common/filters/domain-exception.filter.ts` — @Catch(DomainException)
- `src/common/filters/global-exception.filter.ts` — @Catch() all
- `src/common/pipes/zod-validation.pipe.ts` — ZodSchema transform

### Task 7: Common Ports, Exceptions & Shared (depends on Task 4)
**Files:**
- `src/common/ports/i-llm.adapter.ts` — abstract class ILlmAdapter
- `src/common/ports/i-email.adapter.ts` — abstract class IEmailAdapter
- `src/common/ports/i-market-data.adapter.ts` — abstract class IMarketDataAdapter
- `src/common/exceptions/domain.exception.ts` — Base DomainException
- `src/common/exceptions/prospect-not-found.exception.ts`
- `src/common/exceptions/blacklisted-contact.exception.ts`
- `src/common/exceptions/claude-api-unavailable.exception.ts`
- `src/common/exceptions/duplicate-lead.exception.ts`
- `src/common/exceptions/scoring-calculation.exception.ts`
- `src/common/common.module.ts` — Exports all common providers
- `src/shared/dtos/pagination.dto.ts`
- `src/shared/dtos/id-param.dto.ts`
- `src/shared/types/agent-status.enum.ts`
- `src/shared/types/pipeline-stage.enum.ts`
- `src/shared/utils/date.util.ts`
- `src/shared/utils/string.util.ts`
- `src/shared/utils/crypto.util.ts`
- `src/shared/constants/queue-names.constant.ts` — 9 queue names
- `src/shared/constants/agent-ids.constant.ts`

### Task 8: Agent Modules 1-5 (depends on Tasks 5,6,7)
For each agent (Veilleur, Enrichisseur, Scoreur, Rédacteur, Suiveur):
- `domain/entities/{entity}.entity.ts` — Static factory, immutable
- `domain/repositories/i-{entity}.repository.ts` — Abstract class port
- `application/services/{agent}.service.ts` — Orchestration use case
- `application/dtos/{action}.dto.ts` — Zod schema + type
- `infrastructure/repositories/prisma-{entity}.repository.ts` — Mapper pattern
- `presentation/controllers/{agent}.controller.ts` — REST endpoints
- `agent-{name}.module.ts` — Module registration with DI

### Task 9: Agent Modules 6-10 (depends on Tasks 5,6,7)
Same structure as Task 8 but includes:
- Agent 7 (Analyste): + `application/commands/`, `application/queries/` (CQRS)
- Agent 9 (Appels d'Offres): + `application/commands/`, `application/queries/` (CQRS)

### Task 10: Support Modules (depends on Tasks 5,6,7)
**Auth Module:**
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/strategies/jwt.strategy.ts`
- `src/modules/auth/auth.module.ts`

**Prospects Module:**
- `src/modules/prospects/domain/entities/prospect.entity.ts`
- `src/modules/prospects/domain/repositories/i-prospect.repository.ts`
- `src/modules/prospects/application/services/prospect.service.ts`
- `src/modules/prospects/infrastructure/repositories/prisma-prospect.repository.ts`
- `src/modules/prospects/presentation/controllers/prospect.controller.ts`
- `src/modules/prospects/prospects.module.ts`

**Dashboard Module:**
- `src/modules/dashboard/dashboard.controller.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/dashboard.module.ts`

### Task 11: App Assembly (depends on all above)
**Files:**
- `src/app.module.ts` — Import all modules, register global guards
- `src/main.ts` — Bootstrap, middleware (Helmet, CORS, body parser), global filters/interceptors/pipes

## Acceptance Criteria Mapping
- AC1 (NestJS boots): Tasks 1, 4, 11
- AC2 (Docker all services): Task 2
- AC3 (Prisma schema): Task 3
- AC4 (10 agent modules): Tasks 8, 9
- AC5 (Guards): Task 5
- AC6 (Interceptors): Task 6
- AC7 (Exception filters): Task 6
- AC8 (BullMQ queues): Tasks 4, 8, 9 (queue config in each agent module)
- AC9 (Adapter ports): Task 7
- AC10 (TypeScript compiles): Task 11

## Risks
1. **Scope**: ~160+ files. Mitigate with skeleton-first approach (stubs, not full implementations)
2. **Prisma 7 breaking changes**: Use @prisma/adapter-pg for driver adapters
3. **BullMQ version compatibility**: Pin to 5.71.0 per docs
