# ProspectionAgentic — Context for Claude

## Projet
Système de prospection automatique B2B multi-agents IA pour Axiom Marketing.
10 agents orchestrateurs + ~40 sous-agents couvrant tout le cycle commercial.

## Documentation complète
- **Brainstorming stratégique** : `.claude/brainstorming/` (13 fichiers, 4000+ lignes)
- **Documentation technique** : `.claude/docs/` (49 fichiers, 45K+ lignes, 1.6 MB)
- **Specs agents originales** : `.claude/source-ia/agent/` (40+ fichiers)

## Stack Technique Décidée
- **Backend** : Node.js 22.22.1 + NestJS 11.1.17 + TypeScript 5.9.3
- **DB** : PostgreSQL 16.13 + Redis 7.4.3 + Prisma 7.4
- **Queue & Orchestration interne** : BullMQ 5.71.0 (inter-agents via queues)
- **LLM** : Claude API (Haiku/Sonnet/Opus routing) via @anthropic-ai/sdk
- **Webhooks externes** : n8n >=1.123.17 self-hosted (BOAMP cron, Mailgun/Waalaxy webhooks, Slack digest uniquement)
- **Monitoring** : Langfuse v3.143 + Metabase 0.59.1.6 + Pino 10.3.1
- **Proxy** : Caddy 2.11.2
- **Dashboard** : React 19.1 + Vite 6.2 + Tailwind v4 + shadcn/ui

## Architecture NestJS
Clean Architecture (Hexagonal/Ports & Adapters) avec :
- Thin Controllers / Fat Services
- Repository Pattern (abstract classes pour DI)
- Adapter Pattern pour toutes les APIs externes (ILlmAdapter, IEmailAdapter, IMarketDataAdapter)
- Guards (JWT, ApiKey, Roles), Interceptors (Logging, Transform, Timeout, Langfuse), ZodValidationPipe
- DomainExceptionFilter + GlobalExceptionFilter
- CQRS pour Agents 7 et 9 uniquement
- Modules organisés par domaine : agent-veilleur, agent-enrichisseur, etc.
- Doc complète : `.claude/docs/02-STACK-TECHNIQUE/05-architecture-nestjs.md`

## Roadmap
5 phases, Phase 0.7-0.10 en cours (setup infrastructure + NestJS).
Roadmap détaillée : `.claude/docs/09-ROADMAP.md`

## Architecture d'orchestration
- **Inter-agents** : 100% interne via BullMQ (Veilleur → Enrichisseur → Scoreur → Rédacteur → Suiveur → ...)
- **n8n** : UNIQUEMENT pour les triggers externes (cron BOAMP 4h, webhooks Mailgun/Waalaxy, daily digest Slack)
- **Pas d'orchestration n8n entre agents** — tout passe par les queues BullMQ internes

## Prochaine Étape
Dashboard React frontend + tests d'intégration live avec APIs externes.

## Sécurité
50+ CVEs documentés. Registre : `.claude/brainstorming/10-AUDIT-SECURITE-CVE.md`
Hardening guide : `.claude/docs/04-SECURITE/02-hardening-guide.md`
PyMuPDF CVE-2026-0006 (9.8) SANS PATCH → sandbox Docker obligatoire.
