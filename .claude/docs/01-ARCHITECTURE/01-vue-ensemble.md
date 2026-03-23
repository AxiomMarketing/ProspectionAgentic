# Architecture — Vue d'Ensemble

## Table des matières

1. [Vue système](#vue-système)
2. [Principes fondamentaux](#principes-fondamentaux)
3. [Choix technologiques](#choix-technologiques)
4. [Infrastructure](#infrastructure)
5. [Flux de données principal](#flux-de-données-principal)
6. [Objectifs de performance](#objectifs-de-performance)
7. [Considérations de scalabilité](#considérations-de-scalabilité)

---

## Vue système

Le système ProspectionAgentic est une plateforme d'automatisation B2B composée de 10 agents maîtres et ~40 sous-agents. Il traite 30 à 80 leads par jour en suivant un pipeline linéaire principal, complété par des flux latéraux pour le nurturing, l'analyse, la gestion commerciale et la fidélisation.

### Diagramme ASCII — Topologie des agents

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PROSPECTION AGENTIC — PIPELINE                         │
└─────────────────────────────────────────────────────────────────────────────────┘

  SOURCES EXTERNES
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ LinkedIn │  │ Marchés  │  │   Web    │  │  Jobs    │
  │  Sales   │  │ Publics  │  │ Scraping │  │ Offres   │
  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
       └──────────────┴─────────────┴──────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   AGENT 1          │
                    │   VEILLEUR         │◄── Cron: toutes les 2h
                    │ (1a,1b,1c,1d)      │
                    └─────────┬──────────┘
                              │  raw_leads → enrichisseur-pipeline
                    ┌─────────▼──────────┐
                    │   AGENT 2          │
                    │   ENRICHISSEUR     │◄── Queue consumer
                    │ (2a,2b,2c)         │
                    └─────────┬──────────┘
                              │  enriched_leads → scoreur-pipeline
                    ┌─────────▼──────────┐
                    │   AGENT 3          │
                    │   SCOREUR          │◄── Queue consumer
                    │  (monolithique)    │    ▲ Feedback: Agent 6 Re-Scoreur
                    └─────────┬──────────┘
                              │
                   score < 60 │ score >= 60
              ┌───────────────┤
              ▼               ▼
    ┌──────────────┐  ┌───────────────────┐
    │  AGENT 6     │  │    AGENT 4        │
    │  NURTUREUR   │  │    RÉDACTEUR      │◄── redacteur-pipeline
    │ (6a,6b,6c)   │  │  (4a,4b,4c)      │
    └──────┬───────┘  └────────┬──────────┘
           │                   │  messages → suiveur-pipeline
           │          ┌────────▼──────────┐
           │          │    AGENT 5        │
           │          │    SUIVEUR        │◄── Queue consumer
           │          │  (5a,5b,5c,5d)   │
           │          └────────┬──────────┘
           │                   │
           │          ┌────────▼──────────┐
           │          │    AGENT 8        │
           │          │    DEALMAKER      │◄── dealmaker-pipeline
           │          │  (8a,8b,8c)      │
           │          └────────┬──────────┘
           │                   │  deal signé
           │          ┌────────▼──────────┐
           │          │    AGENT 10       │
           │          │      CSM          │◄── csm-onboarding
           │          │ (10a,10b,10c,     │
           │          │  10d,10e)         │
           │          └────────┬──────────┘
           │                   │ feedback loops
           │    ┌──────────────┤
           │    │ ◄─── Agent 10 → Agent 8 (upsell signals)
           │    │ ◄─── Agent 10 → Agent 1 (referral leads)
           │    │ ◄─── Agent 6  → Agent 3 (re-score après nurture)
           │    └──────────────┘
           │
    ┌──────▼───────────────────────────────────────────┐
    │                   AGENT 7                        │
    │                   ANALYSTE                       │◄── Temps réel + cron
    │              (7a,7b,7c,7d)                       │
    └───────────────────┬──────────────────────────────┘
                        │  rapports, anomalies, recommandations
                        ▼
                  Metabase / Langfuse

    ┌─────────────────────────────────────────────────┐
    │                  AGENT 9                        │
    │           APPELS D'OFFRES                       │◄── Flux parallèle
    │        (9a,9b,9c,9d,9e,9f,9g)                  │    indépendant
    └─────────────────────────────────────────────────┘
```

### Résumé des agents

| # | Agent | Sous-agents | Rôle principal | Déclencheur |
|---|-------|-------------|----------------|-------------|
| 1 | Veilleur | 4 | Détection de leads | Cron 2h |
| 2 | Enrichisseur | 3 | Complétion des données | Queue |
| 3 | Scoreur | 0 | Score 0-100 | Queue |
| 4 | Rédacteur | 3 | Génération de messages | Queue |
| 5 | Suiveur | 4 | Envoi et suivi | Queue |
| 6 | Nurtureur | 3 | Leads < 60 points | Queue + Cron |
| 7 | Analyste | 4 | Reporting et anomalies | Continu |
| 8 | Dealmaker | 3 | Gestion commerciale | Événement |
| 9 | Appels d'Offres | 7 | Marchés publics | Trigger |
| 10 | CSM | 5 | Fidélisation client | Événement |

---

## Principes fondamentaux

### 1. Architecture événementielle (Event-Driven)

Tous les agents communiquent exclusivement via des queues BullMQ. Aucun agent n'appelle directement un autre agent en synchrone. Ce découplage garantit :

- **Résilience** : la défaillance d'un agent ne bloque pas les autres
- **Observabilité** : chaque message est tracé dans Redis et Langfuse
- **Rejeu** : les messages échoués sont conservés dans une Dead Letter Queue (DLQ)
- **Backpressure** : les consommateurs lents ne saturent pas les producteurs

```
Agent A (producteur)
    │
    │ addJob(queue, payload)
    ▼
Redis (BullMQ)
    │
    │ process(job)
    ▼
Agent B (consommateur)
```

### 2. Pattern Pipeline

Le flux principal suit un pipeline strict et ordonné. Chaque étape reçoit la sortie de l'étape précédente et enrichit le modèle de données `Lead` :

```
raw_lead → enriched_lead → scored_lead → drafted_lead → tracked_lead → deal
```

Ce pattern permet :
- Des transformations incrémentales et vérifiables
- Une reprise facile en cas d'erreur (rejouer à partir de l'étape échouée)
- Des tests d'intégration ciblés par étape

### 3. Séparation des responsabilités

Chaque agent maître a une responsabilité unique et non chevauchante. Les sous-agents représentent des spécialisations internes (canaux, types de données) mais ne sont jamais exposés directement aux autres agents maîtres.

```
Agent Maître  ←→  Queue inter-agents  (API publique)
    │
    ▼
Sous-agents   ←→  Logique interne     (API privée)
```

### 4. Dégradation gracieuse (Graceful Degradation)

Chaque agent est conçu pour produire une sortie minimale acceptable même en cas de défaillance partielle :

- **Enrichisseur** : si l'API Apollo échoue, utiliser les données LinkedIn uniquement
- **Scoreur** : si des données sont manquantes, utiliser des valeurs par défaut pondérées
- **Rédacteur** : si un template Claude échoue, utiliser un template statique de fallback
- **Veilleur** : si LinkedIn est rate-limité, différer et compenser sur les autres sources

Le système ne bloque jamais complètement ; il dégrade la qualité de sortie de façon contrôlée et mesurée.

### 5. Idempotence

Tous les jobs BullMQ utilisent des `jobId` déterministes basés sur les données source. Un lead détecté deux fois ne sera enrichi qu'une seule fois.

```typescript
// Pattern d'idempotence
const jobId = `lead:${sourceId}:${hash(url)}`;
await queue.add('process', payload, { jobId, removeOnComplete: 100 });
```

---

## Choix technologiques

### NestJS 11 plutôt qu'AdonisJS

| Critère | NestJS | AdonisJS | Décision |
|---------|--------|----------|----------|
| Ecosystème TypeScript | Natif, decorators first | Bonne intégration | NestJS |
| Module BullMQ | `@nestjs/bull` officiel | Manuel | NestJS |
| Injection de dépendances | IoC container complet | Basique | NestJS |
| Tests unitaires | Très bon support (TestingModule) | Limité | NestJS |
| Microservices | Pattern natif | Non prévu | NestJS |
| Communauté | Très large, nombreux exemples LLM | Plus petite | NestJS |

NestJS impose une structure modulaire qui correspond directement à la décomposition en agents : chaque agent est un module NestJS avec ses propres services, queues et schedulers.

### BullMQ plutôt que RabbitMQ ou Kafka

| Critère | BullMQ | RabbitMQ | Kafka |
|---------|--------|----------|-------|
| Dépendance infra | Redis (déjà requis) | Serveur dédié | Cluster JVM |
| Priorités de jobs | Natif | Plugins | Absent |
| Retry avec backoff | Natif | Manuel | Manuel |
| Dead Letter Queue | Natif | Manuel | Manuel |
| Dashboard | Bull Board intégré | Management UI | Outil tiers |
| Volume (30-80/jour) | Largement suffisant | Overkill | Overkill |

Pour un volume de 30-80 leads/jour, BullMQ sur Redis est la solution la plus simple opérationnellement sans sacrifier les fonctionnalités nécessaires (retry, DLQ, priorités, délais).

### PostgreSQL 16 plutôt que MongoDB

| Critère | PostgreSQL 16 | MongoDB |
|---------|---------------|---------|
| Intégrité relationnelle | ACID complet | Eventual consistency |
| JSONB | Natif et indexable | Natif |
| Requêtes analytiques | Excellent (window functions) | Limité |
| Transactions multi-tables | Natif | Sessions multi-docs |
| Extensions IA | pgvector pour embeddings | Atlas Vector Search |
| Expérience équipe | Standard | Spécifique |

La nature relationnelle des données (leads → entreprises → contacts → deals → CSM) justifie PostgreSQL. Le support JSONB permet de stocker les payloads variables des agents sans schéma rigide.

### Claude API (Anthropic)

Choisi pour :
- Capacités de raisonnement supérieures pour la qualification de leads
- Context window large (200K tokens) pour analyser des DCE complets (Agent 9)
- API structured output pour garantir des JSON valides en sortie d'agent
- Modèle de coût prévisible (tokens entrants < sortants)

### Langfuse

Observabilité LLM complète :
- Tracing de chaque appel Claude (prompt, tokens, latence, coût)
- Agrégation par agent et par pipeline
- Détection d'anomalies sur les patterns de génération
- Pas d'envoi de données vers des tiers non maîtrisés

### n8n

Orchestration des webhooks et intégrations tierces :
- Réception des webhooks Lemlist (tracking email)
- Réception des webhooks LinkedIn Sales Navigator
- Pas de logique métier dans n8n — uniquement routing vers les queues NestJS

---

## Infrastructure

### Topologie VPS

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VPS PRINCIPAL                              │
│                     Ubuntu 24.04 LTS                                │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │   NGINX          │  │  NestJS API     │  │  NestJS Workers     │ │
│  │   :80 / :443     │  │  :3000          │  │  (agents 1-10)      │ │
│  │                  │  │  REST + WS      │  │  Pas de port HTTP   │ │
│  │  - Reverse proxy │  │  - Webhooks     │  │  Queue consumers    │ │
│  │  - SSL/TLS       │  │  - Healthcheck  │  │  Cron schedulers    │ │
│  │  - Rate limiting │  │  - Auth JWT     │  │                     │ │
│  └────────┬─────────┘  └────────┬────────┘  └──────────┬──────────┘ │
│           │                     │                       │            │
│           └──────────────────────┴───────────────────────┘            │
│                                  │                                   │
│  ┌─────────────────┐  ┌──────────▼──────┐  ┌─────────────────────┐ │
│  │  PostgreSQL 16  │  │   Redis 7        │  │       n8n           │ │
│  │  :5432          │  │   :6379          │  │  :5678              │ │
│  │                 │  │                  │  │                     │ │
│  │  - leads        │  │  - BullMQ queues │  │  - Webhooks         │ │
│  │  - companies    │  │  - Sessions      │  │  - Integrations     │ │
│  │  - deals        │  │  - Rate limits   │  │  - Routing          │ │
│  │  - messages     │  │  - Cache         │  │                     │ │
│  │  - analytics    │  │                  │  │                     │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────────┘ │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────┐                         │
│  │   Langfuse      │  │    Metabase      │                         │
│  │  :3001          │  │    :3002         │                         │
│  │                 │  │                  │                         │
│  │  - LLM traces   │  │  - Dashboards    │                         │
│  │  - Coût tokens  │  │  - KPIs          │                         │
│  │  - Qualité      │  │  - Alertes       │                         │
│  └─────────────────┘  └──────────────────┘                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Bull Board                               │   │
│  │                    :3003 (interne)                          │   │
│  │  - Monitoring queues BullMQ en temps réel                   │   │
│  │  - Retry manuel des jobs échoués                            │   │
│  │  - Visualisation DLQ                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

SERVICES EXTERNES
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐
│ LinkedIn     │  │ Claude API   │  │ Apollo.io    │  │  Lemlist   │
│ Sales Nav    │  │ (Anthropic)  │  │ (enrichment) │  │  (email)   │
└──────────────┘  └──────────────┘  └──────────────┘  └────────────┘
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Clearbit     │  │ Société.com  │  │ BOAMP / TED  │
│ (enrichment) │  │ (juridique)  │  │  (AO public) │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Ports et services

| Service | Port | Accessible depuis |
|---------|------|-------------------|
| NestJS API | 3000 | NGINX uniquement |
| PostgreSQL | 5432 | NestJS uniquement |
| Redis | 6379 | NestJS uniquement |
| n8n | 5678 | NGINX (auth) |
| Langfuse | 3001 | NGINX (auth) |
| Metabase | 3002 | NGINX (auth) |
| Bull Board | 3003 | NGINX (auth, IP whitelist) |
| NGINX HTTP | 80 | Internet |
| NGINX HTTPS | 443 | Internet |

### Sécurité réseau

- PostgreSQL et Redis non exposés à l'extérieur (bind 127.0.0.1)
- Toutes les communications inter-services via réseau Docker interne
- Bull Board accessible uniquement depuis IP whitelistées
- Langfuse et Metabase derrière authentification SSO ou Basic Auth NGINX
- Secrets stockés dans `.env` chiffré (via `ansible-vault` en production)

---

## Flux de données principal

Le flux complet d'un lead depuis sa détection jusqu'au succès client suit 8 étapes séquentielles, avec des points de branchement conditionnels.

```
ÉTAPE 1 — DÉTECTION
─────────────────────
Cron (toutes les 2h)
    │
    ▼
Agent 1 (Veilleur) scrape LinkedIn/Web/Marchés/Jobs
    │
    ├── Déduplique via jobId déterministe
    ├── Normalise le format raw_lead
    └── Publie dans enrichisseur-pipeline
            │
            ▼ Payload: { sourceId, url, source, detectedAt }

ÉTAPE 2 — ENRICHISSEMENT
──────────────────────────
Agent 2 (Enrichisseur) consomme enrichisseur-pipeline
    │
    ├── 2a: Contact (Apollo, LinkedIn)      → téléphone, email, poste
    ├── 2b: Entreprise (Clearbit, Société)  → CA, effectif, secteur
    └── 2c: Technique (BuiltWith, Wappalyzer) → stack technique
            │
            ▼ Payload: enriched_lead (50+ champs)

ÉTAPE 3 — SCORING
───────────────────
Agent 3 (Scoreur) consomme scoreur-pipeline
    │
    ├── Score ICP (0-40 pts): secteur, taille, tech
    ├── Score Intent (0-30 pts): signaux d'achat récents
    └── Score Timing (0-30 pts): déclencheurs contextuels
            │
            ├── score < 60 → nurturer-pipeline (Agent 6)
            └── score >= 60 → redacteur-pipeline (Agent 4)

ÉTAPE 4 — RÉDACTION (si score >= 60)
──────────────────────────────────────
Agent 4 (Rédacteur) consomme redacteur-pipeline
    │
    ├── 4a: Email (Claude API → email personnalisé)
    ├── 4b: LinkedIn (Claude API → message InMail)
    └── 4c: Impact (Claude API → cas d'usage spécifique)
            │
            ▼ Payload: { messages[], channel, personalization_score }

ÉTAPE 5 — SUIVI
─────────────────
Agent 5 (Suiveur) consomme suiveur-pipeline
    │
    ├── 5a: Envoie emails via Lemlist
    ├── 5b: Envoie messages LinkedIn via Sales Navigator
    ├── 5c: Analyse les réponses reçues
    └── 5d: Gère les séquences de relance
            │
            └── lead qualifié → dealmaker-pipeline (Agent 8)

ÉTAPE 6 — NURTURING (si score < 60)
─────────────────────────────────────
Agent 6 (Nurtureur) consomme nurturer-pipeline
    │
    ├── 6a: Séquences email nurture longue durée
    ├── 6b: Engagement LinkedIn passif (likes, commentaires)
    └── 6c: Re-score périodique → retour Agent 3
            │
            └── nouveau score >= 60 → redacteur-pipeline

ÉTAPE 7 — DEAL
───────────────
Agent 8 (Dealmaker) consomme dealmaker-pipeline
    │
    ├── 8a: Génère devis (Claude API + template)
    ├── 8b: Gère relances commerciales
    └── 8c: Prépare dossier signature
            │
            └── deal signé → csm-onboarding (Agent 10)

ÉTAPE 8 — CSM
──────────────
Agent 10 (CSM) consomme csm-onboarding
    │
    ├── 10a: Onboarding client
    ├── 10b: Signaux upsell → Agent 8
    ├── 10c: Mesure satisfaction (NPS)
    ├── 10d: Collecte avis (Google, Trustpilot)
    └── 10e: Programme referral → Agent 1 (nouveaux leads)
```

---

## Objectifs de performance

### Latences cibles par agent

| Agent | Latence P50 | Latence P95 | Latence P99 |
|-------|-------------|-------------|-------------|
| Veilleur (par lead) | < 500ms | < 2s | < 5s |
| Enrichisseur | < 3s | < 10s | < 30s |
| Scoreur | < 200ms | < 500ms | < 1s |
| Rédacteur | < 5s | < 15s | < 30s |
| Suiveur | < 1s | < 5s | < 10s |
| Dealmaker | < 10s | < 30s | < 60s |

### Throughput

| Métrique | Valeur cible |
|----------|-------------|
| Leads détectés/jour | 30-80 |
| Leads enrichis/heure | 20 max |
| Appels Claude/heure | 50 max (rate limit) |
| Messages envoyés/jour | 40 max (compliance LinkedIn) |
| Jobs BullMQ en queue | < 200 à tout moment |

### Disponibilité

| Composant | SLA cible | Stratégie |
|-----------|-----------|-----------|
| API NestJS | 99.5% | PM2 cluster + restart auto |
| PostgreSQL | 99.9% | Réplication + backup daily |
| Redis | 99.5% | Persistence AOF |
| n8n | 99% | Restart auto |
| Service global | 99% | Degradation gracieuse si agent down |

### Budget LLM (Claude API)

| Agent | Tokens/lead estimé | Coût/lead | Coût/mois (50 leads/j) |
|-------|--------------------|-----------|------------------------|
| Scoreur | 2 000 | ~$0.006 | ~$9 |
| Rédacteur | 8 000 | ~$0.024 | ~$36 |
| Enrichisseur | 1 000 | ~$0.003 | ~$4.50 |
| Analyste | 5 000 | ~$0.015 | ~$22.50 |
| Agent 9 (par AO) | 50 000 | ~$0.15 | Variable |
| **Total estimé** | | | **~$75-150/mois** |

---

## Considérations de scalabilité

### Scalabilité horizontale des workers

Les workers NestJS (consommateurs de queues) sont stateless et peuvent être multipliés sans modification. BullMQ gère la distribution des jobs entre plusieurs instances de workers via des verrous Redis.

```bash
# Actuel : 1 worker process
pm2 start dist/main.js --name worker-1

# Scalé : N worker processes (même machine ou multi-VPS)
pm2 start dist/main.js --name worker-1
pm2 start dist/main.js --name worker-2
pm2 start dist/main.js --name worker-3
```

### Limites actuelles et seuils d'upgrade

| Composant | Limite actuelle | Seuil d'upgrade | Solution |
|-----------|-----------------|-----------------|----------|
| Redis single node | ~10K jobs/s | > 1000 leads/j | Redis Cluster |
| PostgreSQL single | ~1000 req/s | > 500 leads/j | Read replica |
| NestJS single | ~500 leads/j | > 300 leads/j | Multi-instance |
| Claude API | 50 req/min | > 100 leads/j | Multi-clé + cache |

### Goulots d'étranglement identifiés

1. **Enrichissement** : les APIs tierces (Apollo, Clearbit) ont des rate limits stricts. Mitigation : file d'attente avec délais exponentiels + cache Redis 30 jours.

2. **Claude API** : 50 requêtes/minute sur le tier standard. Mitigation : concurrency limitée par queue (max 5 workers Rédacteur simultanés).

3. **LinkedIn** : 100 messages/semaine maximum (compliance). Mitigation : rate limiter BullMQ avec `limiter: { max: 20, duration: 86400000 }`.

4. **Base de données** : les requêtes analytiques de l'Agent 7 peuvent ralentir le pipeline. Mitigation : lecture sur replica PostgreSQL dédiée.

### Évolution vers une architecture multi-VPS

Si le volume dépasse 300 leads/jour, l'architecture peut être déployée sur plusieurs VPS avec un Redis partagé comme bus de communication :

```
VPS-1 (API + Agents 1-3)   VPS-2 (Agents 4-6)   VPS-3 (Agents 7-10)
         │                          │                       │
         └──────────────────────────┼───────────────────────┘
                                    │
                              Redis partagé
                              PostgreSQL partagé
```

Cette migration est transparente pour le code applicatif car toute communication passe déjà par les queues.
