# Documentation Technique — Axiom Prospection Agentique

**Version :** 1.0.0
**Dernière mise à jour :** 23 mars 2026
**Stack :** Node.js 22 LTS + NestJS 11 + PostgreSQL 16 + Redis 7 + Claude API + n8n

---

## Navigation Rapide

| Section | Contenu | Quand lire |
|---------|---------|------------|
| [01 - Architecture](./01-ARCHITECTURE/) | Vue d'ensemble, orchestration agents, flux de données | En premier |
| [02 - Stack Technique](./02-STACK-TECHNIQUE/) | Infra, DB, LLM, outils externes, versions | Setup initial |
| [03 - Features](./03-FEATURES/) | Specs de chaque agent (1-10) avec sous-agents | Développement |
| [04 - Sécurité](./04-SECURITE/) | CVE, hardening, RGPD, secrets | Avant production |
| [05 - Observabilité](./05-OBSERVABILITE/) | Dashboard, journalisation, alertes, Langfuse | Phase 1+ |
| [06 - Opérations](./06-OPERATIONS/) | Déploiement, CI/CD, backup, tests | Avant production |
| [07 - Guides](./07-GUIDES/) | Onboarding dev, bonnes pratiques, anti-patterns | Toujours |
| [08 - Dashboard](./08-DASHBOARD/) | Tableau de bord opérationnel : architecture, 7 vues, API, temps réel, déploiement | Développement frontend |
| [09 - Roadmap](./09-ROADMAP.md) | Roadmap complète : 5 phases, sous-étapes, checklists, Go/No-Go, références docs | **Lire en premier pour planifier** |

---

## Structure Complète

```
.claude/docs/
├── 00-INDEX.md                          ← Vous êtes ici
│
├── 01-ARCHITECTURE/
│   ├── 01-vue-ensemble.md               — Architecture globale + diagrammes
│   ├── 02-agents-orchestration.md       — 10 agents, rôles, hiérarchie
│   └── 03-flux-donnees.md              — Queues BullMQ, événements, data flows
│
├── 02-STACK-TECHNIQUE/
│   ├── 01-infrastructure.md             — Node.js 22, NestJS 11, Docker, Caddy, Hetzner
│   ├── 02-base-de-donnees.md            — PostgreSQL 16, Redis 7, schémas, migrations
│   ├── 03-llm-integration.md            — Claude API, model routing, prompt caching, fallbacks
│   ├── 04-outils-externes.md           — n8n, Langfuse, Metabase, APIs tierces
│   └── 05-architecture-nestjs.md        — Clean Architecture, SOLID, Adapters, Contrats, CQRS
│
├── 03-FEATURES/
│   ├── 01-agent-1-veilleur.md           — Détection leads (LinkedIn, BOAMP, web, jobs)
│   ├── 02-agent-2-enrichisseur.md       — Enrichissement contact/entreprise/technique
│   ├── 03-agent-3-scoreur.md            — Scoring 4 axes, coefficients, catégorisation
│   ├── 04-agent-4-redacteur.md          — Génération emails/LinkedIn via Claude
│   ├── 05-agent-5-suiveur.md            — Exécution campagnes, classification réponses
│   ├── 06-agent-6-nurtureur.md          — Nurturing long terme, re-scoring
│   ├── 07-agent-7-analyste.md           — Métriques, anomalies, recommandations
│   ├── 08-agent-8-dealmaker.md          — Devis, relances, signature Yousign
│   ├── 09-agent-9-appels-offres.md      — DCE, qualification GO/NO-GO, mémoire technique
│   └── 10-agent-10-csm.md              — Onboarding, satisfaction, upsell, referral
│
├── 04-SECURITE/
│   ├── 01-registre-cve.md               — 50+ CVEs par composant, versions requises
│   ├── 02-hardening-guide.md            — OWASP Top 10, config sécurisée par composant
│   ├── 03-rgpd-conformite.md            — Conformité RGPD technique, droit effacement
│   └── 04-gestion-secrets.md           — Rotation, stockage, zero-trust par agent
│
├── 05-OBSERVABILITE/
│   ├── 01-tableau-de-bord.md            — Dashboard agents temps réel, métriques, KPIs
│   ├── 02-journalisation.md             — Event sourcing, audit trail, agent logs
│   ├── 03-alerting.md                   — Slack notifications, anomalies, escalation
│   └── 04-langfuse-integration.md      — Setup Langfuse, tracing LLM, coûts
│
├── 06-OPERATIONS/
│   ├── 01-deploiement.md                — Docker Compose, VPS hardening, go-live
│   ├── 02-ci-cd.md                      — GitHub Actions, npm audit, trivy, SBOM
│   ├── 03-backup-dr.md                  — PostgreSQL backup, Redis persistence, RTO/RPO
│   └── 04-tests.md                     — Unit, integration, E2E, security, coverage
│
├── 07-GUIDES/
│   ├── 01-onboarding-dev.md             — Setup dev, premiers pas, glossaire
│   ├── 02-bonnes-pratiques.md           — Conventions code, patterns, sécurité
│   └── 03-anti-patterns.md             — Erreurs à éviter, mauvaises pratiques documentées
│
├── 08-DASHBOARD/
    ├── 00-index.md                      — Point d'entrée dashboard, navigation, mockups
    ├── 01-architecture.md               — Architecture frontend, composants, data flow
    ├── 02-stack-technique.md            — React 19, Vite 6, Tailwind v4, shadcn/ui, etc.
    ├── 03-feature-v1-centre-controle.md — Vue home : status 10 agents + KPIs
    ├── 04-feature-v2-timeline.md        — Fil d'activité chronologique inter-agents
    ├── 05-feature-v3-prospects.md       — CRM interne prospects + fiche détaillée
    ├── 06-feature-v4-marches-publics.md — Marchés publics : scoring, avancement, DCE
    ├── 07-feature-v5-pipeline-deals.md  — Pipeline Kanban deals (7 étapes)
    ├── 08-feature-v6-graph-agents.md    — Visualisation réseau agents (React Flow)
    ├── 09-feature-v7-actions-rapides.md — Todo priorisé avec SLA countdown
    ├── 10-api-backend.md                — 17 endpoints REST + SSE (specs complètes)
    ├── 11-base-de-donnees.md            — Tables dashboard, SQL queries, vues matérialisées
    ├── 12-temps-reel.md                 — SSE, TanStack Query, sons, notifications
    └── 13-deploiement.md               — Docker, nginx, Caddy, CI/CD, preview PRs
│
└── 09-ROADMAP.md                        — Roadmap 5 phases, sous-étapes, checklists, Go/No-Go
```

---

## Comment Utiliser cette Documentation

**Nouveau sur le projet ?**
1. Lire `01-ARCHITECTURE/01-vue-ensemble.md` pour comprendre le système
2. Lire `07-GUIDES/01-onboarding-dev.md` pour setup l'environnement
3. Lire `02-STACK-TECHNIQUE/` pour les choix technologiques

**Développement d'un agent ?**
1. Lire le fichier feature correspondant dans `03-FEATURES/`
2. Consulter `01-ARCHITECTURE/03-flux-donnees.md` pour les I/O
3. Vérifier `04-SECURITE/` pour les contraintes sécurité

**Mise en production ?**
1. Checklist `04-SECURITE/02-hardening-guide.md`
2. Guide `06-OPERATIONS/01-deploiement.md`
3. Setup `05-OBSERVABILITE/` pour le monitoring

**Debugging ?**
1. `05-OBSERVABILITE/02-journalisation.md` pour les logs
2. `05-OBSERVABILITE/01-tableau-de-bord.md` pour le dashboard
3. `05-OBSERVABILITE/04-langfuse-integration.md` pour les traces LLM

---

## Sources de Référence

| Source | Localisation | Usage |
|--------|-------------|-------|
| Specs originales des agents | `.claude/source-ia/agent/` | Source de vérité pour les détails d'implémentation |
| Brainstorming stratégique | `.claude/brainstorming/` | Décisions architecturales et justifications |
| CVE Register | `.claude/brainstorming/10-AUDIT-SECURITE-CVE.md` | Vulnérabilités connues |
| Audit croisé | `.claude/brainstorming/12-AUDIT-CROISE-FINAL.md` | Gaps identifiés |

---

## Versions Requises (Mars 2026)

| Composant | Version Minimum | Raison |
|-----------|----------------|--------|
| Node.js | **22.22.1** | CVE-2025-55130 (CVSS 9.1) |
| NestJS | **11.1.17** | CVE-2025-54782 (CVSS 9.8) |
| PostgreSQL | **16.13** | CVE-2026-2005 (CVSS 8.8) |
| Redis | **7.4.3+** | CVE-2025-49844 (CVSS 10.0) |
| n8n | **>=1.123.17** | CVE-2026-21858 (CVSS 10.0) |
| Caddy | **2.11.2** | CVE-2026-27586 (CVSS 9.3) |
| Docker runc | **>=1.2.8** | CVE-2025-31133 (CVSS 9.3) |
| BullMQ | **5.71.0** | GHSA-7hpj msgpackr fix |
| Puppeteer | **24.40.0** | Chrome 146+ (26 security fixes) |
| Pino | **10.3.1** | Dernière stable |
| Prisma | **7.4.x** | Dernière stable |
| TypeScript | **5.9.3** | Dernière stable |
| React | **19.1.0** | Dernière stable (dashboard) |
| Vite | **6.2.0** | Build tool dashboard |
| Tailwind CSS | **4.0.0** | Styling dashboard |
| React Flow | **12.x** | Graphe agents dashboard |
| TanStack Query | **5.x** | State management dashboard |
| TanStack Table | **8.x** | Tables de données dashboard |
