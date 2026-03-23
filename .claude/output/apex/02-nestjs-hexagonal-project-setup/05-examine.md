# Adversarial Review Findings

## Summary: 40 findings (13 CRITICAL/BLOCKING, 11 HIGH)

## Must-Fix (BLOCKING + CRITICAL) — 18 items

| ID | Sev | Category | Location | Issue |
|----|-----|----------|----------|-------|
| S1 | BLOCK | Security | auth.controller.ts:11 | Login stub returns admin tokens for any input |
| S2 | BLOCK | Security | jwt.strategy.ts:20, auth.module.ts:15 | JWT secret falls back to empty string |
| S3 | BLOCK | Security | api-key.guard.ts:25 | Timing-unsafe API key comparison |
| S4 | BLOCK | Security | auth.service.ts:19 | Refresh token same secret, no jti claim |
| S5 | CRIT | Security | health.controller.ts:5 | Health endpoint missing @Public() |
| S6 | CRIT | Security | auth.controller.ts:4 | Auth controller missing @Public() |
| S7 | CRIT | Security | auth.controller.ts:11,20 | No Zod validation on login/refresh |
| S8 | CRIT | Security | docker-compose.yml:51,84 | Postgres/Redis ports exposed to host |
| S9 | CRIT | Security | .env.example:41 | ADMIN_IP defaults to 0.0.0.0 |
| S10 | CRIT | Security | Caddyfile:15 | unsafe-inline in CSP script-src |
| L1 | CRIT | Logic | prisma-prospect-score.repository.ts:48 | Race condition: non-atomic isLatest update |
| L2 | CRIT | Logic | csm.service.ts:39 | Race condition: non-atomic health score supercede |
| L3 | CRIT | Logic | suiveur.service.ts:37 | Email send without rollback on failure |
| L4 | CRIT | Logic | prospect.entity.ts:32 | create() allows overriding system fields |
| Q1 | CRIT | Quality | prospect.entity.ts:1 | Domain imports from @prisma/client |
| Q2 | CRIT | Quality | Multiple modules | Missing adapter DI registrations |
| Q3 | CRIT | Quality | 3 agent modules | Queue names hardcoded, don't match constants |
| Q4 | CRIT | Quality | app.module.ts:67 | BullModule uses raw process.env |

## Should-Fix (HIGH) — 11 items

| ID | Sev | Category | Location | Issue |
|----|-----|----------|----------|-------|
| S11 | HIGH | Security | pino.config.ts:11 | PII redaction paths incomplete |
| S12 | HIGH | Security | global-exception.filter.ts:44 | Stack traces in non-prod responses |
| S13 | HIGH | Security | No jwt.config.ts | Missing JWT config Zod validation |
| L5 | HIGH | Logic | cache.interceptor.ts:10 | Unbounded memory growth |
| L6 | HIGH | Logic | prospect.service.ts:32 | Update spreads undefined over existing data |
| L7 | HIGH | Logic | prisma-prospect.repository.ts:100 | Update drops ~10 fields |
| L8 | HIGH | Logic | deal.entity.ts:66 | No stage transition validation |
| L9 | HIGH | Logic | dealmaker.service.ts:35 | Quote number not unique under concurrency |
| Q5 | HIGH | Quality | CQRS handlers agent-analyste | Handlers don't inject repository |
| Q6 | HIGH | Quality | agent-appels-offres | AnalyzeTenderHandler needs ILlmAdapter not registered |
| Q7 | HIGH | Quality | common.module.ts + app.module.ts | Duplicate guard registrations |
