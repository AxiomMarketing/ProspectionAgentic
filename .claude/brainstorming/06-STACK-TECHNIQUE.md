# Stack Technique Recommandée

**Ce document détaille chaque choix technologique**, les alternatives évaluées, les justifications, et les edge cases à anticiper.

---

## 1. Vue d'Ensemble de la Stack

```yaml
# ─── INFRASTRUCTURE ───────────────────────────────────────────
Runtime:           Node.js 22 LTS + TypeScript 5.x
Framework:         NestJS 10+ (recommandé) ou AdonisJS 6 (specs originales)
Database:          PostgreSQL 16 + pgvector (mémoire sémantique future)
Cache/Queue:       Redis 7 + BullMQ (Phase 1-2)
                   → Évaluer Temporal.io (Phase 3+)
Orchestration:     n8n self-hosted (workflows visuels + code custom)
Hosting:           Hetzner CAX (ARM) ou Scaleway DEV1 (~15-30 EUR/mois)
Reverse Proxy:     Caddy ou Nginx (avec Let's Encrypt auto)
CI/CD:             GitHub Actions (gratuit pour repos privés)

# ─── LLM ──────────────────────────────────────────────────────
Génération:        Claude Sonnet 4.6 (emails, messages, analyses)
Classification:    Claude Haiku 4.5 (réponses, catégorisation — 5x moins cher)
Analyse complexe:  Claude Opus 4.6 (DCE marchés publics — Phase 4 only)
Observabilité LLM: Langfuse self-hosted (MIT, gratuit)
Caching prompts:   Prompt caching Anthropic natif (-90% sur system prompts)

# ─── OUTREACH ─────────────────────────────────────────────────
Email envoi:       Gmail API (5 comptes max) + Mailgun (fallback + analytics)
Domaines cold:     3 domaines dédiés (JAMAIS le domaine principal)
Warm-up:           Instantly.ai warm-up ($37/mois) ou MailReach
LinkedIn:          APIs conformes RGPD uniquement (après avis juridique)
                   PAS de Waalaxy/Netrows sans validation juridique

# ─── DATA SOURCES (GRATUITES) ─────────────────────────────────
Marchés publics:   BOAMP API (api.gouv.fr) — gratuit
Entreprises:       INSEE Sirene API — gratuit
Données légales:   annuaire-entreprises.data.gouv.fr — gratuit
BODACC:            data.gouv.fr — gratuit
Tech stack:        Wappalyzer npm (gratuit) + Lighthouse CLI (gratuit)
Accessibilité:     axe-core npm (gratuit)

# ─── MONITORING ───────────────────────────────────────────────
Logs applicatifs:  Pino (Node.js) → PostgreSQL ou fichiers rotatifs
Alertes:           Slack API (webhook)
Dashboard BI:      Metabase self-hosted (gratuit)
LLM tracing:       Langfuse self-hosted
Uptime:            UptimeRobot (gratuit jusqu'à 50 monitors)
Error tracking:    Sentry self-hosted ou GlitchTip (gratuit)

# ─── PHASE 4 ADDITIONS ───────────────────────────────────────
PDF génération:    Puppeteer (devis)
E-signature:       Yousign API V3
PDF parsing DCE:   PyMuPDF + Claude Vision (marchés publics)
Scraping avancé:   Crawlee (si scraping web nécessaire)
```

---

## 2. Justification de Chaque Choix

### 2.1 NestJS vs AdonisJS

| Critère | NestJS | AdonisJS |
|---------|--------|----------|
| Popularité GitHub | 68K+ stars | 16K+ stars |
| Écosystème plugins | Très large | Limité |
| Architecture modulaire | Excellente (Modules/Providers/Guards) | Bonne (MVC) |
| Pool de talents France | Large | Restreint |
| Performance à scale | Testé enterprise (Uber, Netflix) | Documenté jusqu'à ~50 modèles |
| Courbe d'apprentissage | Moyenne (Angular-like DI) | Faible (Laravel-like) |
| TypeScript natif | Oui | Oui |
| Support BullMQ | @nestjs/bull (package officiel) | Via AdonisJS lucid + custom |

**Recommandation :** NestJS pour la scalabilité et l'écosystème. AdonisJS acceptable si l'équipe le maîtrise déjà.

**Edge case :** Si l'équipe n'a aucune expérience NestJS ni AdonisJS, Express.js simple + TypeScript est plus rapide à démarrer. NestJS ajoute de la structure mais aussi de la complexité initiale.

### 2.2 BullMQ vs Temporal.io vs Inngest

| Critère | BullMQ | Temporal.io | Inngest |
|---------|--------|------------|---------|
| Complexité setup | Faible (Redis seul) | Élevée (cluster séparé) | Faible (serverless) |
| Replay déterministe | Non | Oui (killer feature) | Partiel |
| Fault tolerance | Basique (retry) | Excellente | Bonne |
| Coût | Gratuit + Redis | Gratuit (self-hosted) ou Temporal Cloud | Free tier + plans payants |
| Observabilité | Basique (Bull Board) | Excellent (Web UI natif) | Bon (dashboard) |
| Support Node.js | Natif | SDK Node.js disponible | Natif |
| Adapté pour | Queues simples, jobs | Workflows complexes, sagas | Event-driven, serverless |

**Recommandation :**
- **Phase 1-2 :** BullMQ (simple, rapide à mettre en place)
- **Phase 3+ :** Évaluer migration vers Temporal.io pour les workflows critiques (scoring, deals, appels d'offres)

**Edge case BullMQ :**
- OBLIGATION de configurer `maxmemory-policy: noeviction` dans Redis, sinon perte de données possible
- Les event listeners ne sont PAS transactionnels — ne jamais baser une logique critique sur les événements BullMQ
- Si `enableOfflineQueue: true` (défaut), les jobs ajoutés pendant une déconnexion Redis bloquent le process → mettre à `false`

### 2.3 PostgreSQL + pgvector

**Pourquoi PostgreSQL :**
- Toutes les données sont relationnelles (prospects, scores, séquences, deals)
- Vues matérialisées pour les analytics (Agent 7)
- JSONB pour les données semi-structurées (signaux, metadata)
- Transactions ACID pour les opérations critiques (déduplication, scoring)
- pgvector pour une future mémoire sémantique (recherche de prospects similaires)

**Configuration recommandée :**
```sql
-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID v4
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector (Phase future)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Full-text search rapide

-- Paramètres de performance
shared_buffers = 256MB          -- 25% de la RAM disponible
effective_cache_size = 768MB    -- 75% de la RAM
work_mem = 16MB                 -- Pour les sorts/joins
maintenance_work_mem = 128MB    -- Pour VACUUM, CREATE INDEX
```

**Edge case :**
- Les vues matérialisées doivent être rafraîchies régulièrement (cron). Si le refresh échoue, les données Analytics (Agent 7) sont stale
- pgvector n'est nécessaire que si une recherche sémantique est implémentée (Phase future). Ne pas installer inutilement

### 2.4 Claude API — Model Routing

**Stratégie de routing recommandée :**

| Tâche | Modèle | Coût/appel | Justification |
|-------|--------|-----------|---------------|
| Classification réponse email | Haiku 4.5 | ~0.001€ | Tâche simple, volume élevé |
| Catégorisation signal | Haiku 4.5 | ~0.001€ | Pattern matching basique |
| Génération email cold | Sonnet 4.6 | ~0.005€ | Qualité rédactionnelle nécessaire |
| Génération message LinkedIn | Sonnet 4.6 | ~0.005€ | Personnalisation importante |
| Résumé rapport analytics | Sonnet 4.6 | ~0.01€ | Synthèse de données |
| Génération commentaire LinkedIn | Sonnet 4.6 | ~0.003€ | Naturalité requise |
| Analyse DCE 100+ pages | Opus 4.6 | ~0.05-0.20€ | Raisonnement complexe requis |
| Rédaction mémoire technique | Opus 4.6 | ~0.10-0.30€ | Qualité rédactionnelle critique |

**Économie estimée :**
- Sans routing (tout Sonnet) : ~75 EUR/mois
- Avec routing (Haiku 70% + Sonnet 25% + Opus 5%) : ~25 EUR/mois
- **Économie : ~67%**

**Prompt caching :**
- Chaque agent a un system prompt stable → cacher via Anthropic prompt caching natif
- Réduction additionnelle de ~90% sur les tokens de system prompt
- Impact : les appels répétitifs (classification de 500 réponses/mois avec le même system prompt) deviennent quasi-gratuits

**Fallback chain :**
```
Claude Sonnet → (si échec) → Claude Haiku → (si échec) → Template statique
```

### 2.5 n8n vs Make.com vs Code Custom

| Critère | n8n | Make.com | Code Custom |
|---------|-----|---------|-------------|
| Self-hosted | Oui (Docker) | Non | Oui |
| Contrôle données | Total | Données sur leur cloud | Total |
| Code custom | JS/Python dans les noeuds | Limité | Total |
| Intégrations | 1000+ | 1500+ | À construire |
| Coût | Gratuit (self-hosted) | ~30-100€/mois | Temps de développement |
| Debugging | Interface visuelle | Interface visuelle | Logs manuels |
| Scalabilité | Limitée (1 worker par défaut) | Limitée par plan | Illimitée |

**Recommandation :** n8n self-hosted pour :
- Orchestration des crons (scheduling des agents)
- Intégrations simples (Slack notifications, webhook processing)
- Workflows visuels pour les séquences email/LinkedIn

**Code TypeScript custom pour :**
- Moteur de scoring (Agent 3) — trop complexe pour n8n
- Génération Claude (Agent 4) — nécessite une logique de retry/validation avancée
- Classification des réponses (Agent 5c) — nécessite matching de threads
- Parsing PDF/DCE (Agent 9) — nécessite des librairies spécialisées

### 2.6 Hosting — Hetzner vs Scaleway vs AWS

| Critère | Hetzner CAX | Scaleway DEV1 | AWS t3.medium |
|---------|-------------|---------------|---------------|
| CPU | 4 ARM | 2 x86 | 2 vCPU |
| RAM | 8 GB | 2 GB | 4 GB |
| Storage | 40 GB SSD | 20 GB | 50 GB EBS |
| Prix/mois | ~15€ | ~5€ | ~35€ |
| Datacenter EU | Finlande/Allemagne | Paris | Irlande |
| Backup inclus | Non (2€/mois extra) | Non | Non |

**Recommandation :** Hetzner CAX21 (~15€/mois) — meilleur rapport perf/prix. ARM est parfaitement compatible avec Node.js, PostgreSQL, Redis, n8n.

**Edge case :** Si le volume augmente (>1000 prospects/mois), prévoir un upgrade vers CAX31 (16GB RAM, ~25€/mois) ou une séparation DB sur un server dédié.

---

## 3. Schéma d'Infrastructure

```
┌──────────────────────────────────────────────────────┐
│                   VPS Hetzner CAX21                   │
│                   (4 ARM, 8GB RAM)                    │
│                                                       │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐             │
│  │ Caddy   │  │  n8n    │  │ Langfuse │             │
│  │ (proxy) │  │ (orch)  │  │ (LLM     │             │
│  │ :443    │  │ :5678   │  │  trace)  │             │
│  └────┬────┘  └────┬────┘  └────┬─────┘             │
│       │            │            │                     │
│  ┌────┴────────────┴────────────┴─────┐              │
│  │         NestJS Application          │              │
│  │    (Agents 1-5 workers + API)       │              │
│  │    Port :3000                       │              │
│  └────┬─────────────────────┬─────────┘              │
│       │                     │                         │
│  ┌────┴────┐          ┌─────┴─────┐                  │
│  │ Redis 7 │          │ PostgreSQL│                   │
│  │ :6379   │          │ 16 :5432  │                   │
│  │ (BullMQ │          │ (données  │                   │
│  │  cache) │          │  + pgvec) │                   │
│  └─────────┘          └───────────┘                  │
│                                                       │
│  ┌──────────┐                                        │
│  │ Metabase │                                        │
│  │ :3001    │                                        │
│  │ (BI)     │                                        │
│  └──────────┘                                        │
└──────────────────────────────────────────────────────┘
          │
          │ HTTPS
          ▼
   ┌──────────────┐
   │ APIs Externes │
   │ Claude, Gmail,│
   │ BOAMP, INSEE  │
   └──────────────┘
```

---

*Pour la roadmap d'implémentation par phases, voir `07-ROADMAP-PHASES.md`.*
