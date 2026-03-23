# Analysis: NestJS Hexagonal Project Setup

## Project State
**Greenfield** — No code exists. Only `.claude/` documentation (141 files, ~50K lines).
No package.json, no src/, no docker-compose, no Dockerfile, no .env, no git repo.

## Architecture Decisions (from `.claude/docs/02-STACK-TECHNIQUE/05-architecture-nestjs.md` — 3061 lines)

### Hexagonal/Clean Architecture
- Domain layer: pure TypeScript, zero external deps
- Application layer: services (use cases), DTOs, ports (abstract classes)
- Infrastructure layer: Prisma repos, API adapters, BullMQ processors
- Presentation layer: Controllers

### Key Patterns
- Abstract classes (not interfaces) for DI tokens
- Mapper pattern: toDomain() / toPrisma() in repositories
- Static factory methods on entities: `.create()`, `.reconstitute()`
- Zod schemas for DTO validation via ZodValidationPipe
- CQRS only for Agents 7 & 9 (CommandBus/QueryBus)
- Path aliases: @core/*, @common/*, @shared/*, @modules/*

## 10 Agents
| # | Name | Module | Sub-agents | CQRS |
|---|------|--------|-----------|------|
| 1 | Veilleur | agent-veilleur | 1a-1d | No |
| 2 | Enrichisseur | agent-enrichisseur | 2a-2c | No |
| 3 | Scoreur | agent-scoreur | — | No |
| 4 | Rédacteur | agent-redacteur | 4a-4c | No |
| 5 | Suiveur | agent-suiveur | 5a-5d | No |
| 6 | Nurtureur | agent-nurtureur | 6a-6c | No |
| 7 | Analyste | agent-analyste | 7a-7d | Yes |
| 8 | Dealmaker | agent-dealmaker | 8a-8c | No |
| 9 | Appels d'Offres | agent-appels-offres | 9a-9g | Yes |
| 10 | CSM | agent-csm | 10a-10e | No |

## Infrastructure: 8 Docker Services
app, postgres (16.13), redis (7.4.3), n8n (1.123.17), langfuse (3.143), metabase (0.59.1.6), bull-board, caddy (2.11.2)

## Database: 23 Tables, 8 Enums, 9 BullMQ Queues

## Security: Guards + Interceptors + Filters + Middleware + Pipes

## Adapter Ports: ILlmAdapter, IEmailAdapter, IMarketDataAdapter
