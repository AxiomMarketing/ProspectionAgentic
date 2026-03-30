# Agent 7 — ANALYSTE — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-7-MASTER.md` + `AGENT-7a-COLLECTEUR.md` + `AGENT-7b-RAPPORTS.md` + `AGENT-7c-ANOMALIES.md` + `AGENT-7d-RECOMMANDEUR.md`

---

## Architecture

```
AGENT 7 — ANALYSTE MASTER
├── 7a Collecteur de Métriques (SQL quotidien → metriques_daily)
├── 7b Générateur de Rapports (Claude + Slack + Email)
├── 7c Détecteur d'Anomalies (z-scores + seuils fixes → alertes)
└── 7d Recommandeur (Claude API → recommandations actionnables)

Master = orchestrateur cron-based (pas de queue BullMQ en entrée)
```

### Position dans le pipeline

```
TOUS les agents (1-6) produisent des données
                    │
                    ▼
    ═══════════════════════════════════════
    ║  AGENT 7 (ANALYSTE)                ║
    ║  Lecture SQL sur TOUTES les tables  ║
    ║  PAS de queue d'entrée             ║
    ║  Output = rapports + alertes +     ║
    ║           recommandations          ║
    ═══════════════════════════════════════
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
     Slack     Email      Recommandations BDD
  (#pipeline)  (Jonathan)  (feedback → Agents 1-6)
```

### Différence clé avec les autres agents

Agent 7 est **unique** dans le pipeline :
- **Pas de queue BullMQ en entrée** — cron-based, il va chercher les données lui-même
- **Pas de queue BullMQ en sortie** — output = rapports Slack/email + recommandations en BDD
- **CQRS pattern** — utilise CommandBus/QueryBus (comme Agent 9)
- **Lecture seule sur les tables des autres agents** — écrit uniquement dans `metriques_daily`, `alertes`, `recommandations`
- **Ne modifie RIEN** — il mesure, détecte, recommande, mais c'est Jonathan qui valide

---

## Communication inter-agents

### INPUT : pas de queue, lecture SQL directe

Agent 7 lit les données de TOUTES les tables du pipeline via Prisma :

| Agent source | Tables lues | Métriques dérivées |
|-------------|-------------|-------------------|
| Agent 1 Veilleur | `RawLead`, `AgentEvent` | Leads/jour par source, pre-score moyen, coûts API |
| Agent 2 Enrichisseur | `Prospect` (status=enriched), `AgentEvent` | Taux enrichissement, emails trouvés, coûts |
| Agent 3 Scoreur | `ProspectScore` | Distribution HOT/WARM/COLD, score moyen, reclassifications |
| Agent 4 Rédacteur | `GeneratedMessage`, `AgentEvent` | Messages générés, coût génération, templates actifs |
| Agent 5 Suiveur | `EmailSend`, `ReplyClassification`, `ProspectSequence`, `BounceEvent` | Reply rate, bounce rate, séquences actives |
| Agent 6 Nurtureur | `NurtureProspect`, `NurtureInteraction` | Total en nurture, engagement, reclassifications HOT |
| Pipeline global | `DealCrm`, `Prospect` | Deals gagnés/perdus, revenue, pipeline velocity |

### OUTPUT : 4 canaux

1. **metriques_daily** (BDD) — snapshot quotidien ~60 métriques
2. **alertes** (BDD + Slack) — anomalies WARNING/CRITICAL
3. **recommandations** (BDD + Slack) — actions concrètes pour chaque agent
4. **rapports** (Slack + Email) — digest quotidien, hebdo, mensuel

### Scheduling (crons)

```
21:30  │ 7a Collecteur      │ Snapshot métriques quotidiennes
21:45  │ 7c Détecteur       │ Scan anomalies sur snapshot
22:00  │ 7b Générateur      │ Digest quotidien Slack + email
Lun 09:00 │ 7a + 7b         │ Rapport hebdomadaire complet
Lun 09:30 │ 7d Recommandeur │ Recommandations hebdo
1er/mois  │ 7a + 7b + 7d   │ Rapport mensuel stratégique
Toutes les heures │ 7c       │ Alertes anomalies (si données > 2 jours)
```

---

## Code existant — État actuel

| Composant | Status | Lignes |
|-----------|:------:|:------:|
| Module (CQRS) | Fonctionnel | 22 |
| AnalysteService (2 méthodes) | Squelette basique | 35 |
| AnalysteController (2 endpoints) | Sans validation | 25 |
| AnalyzePipelineCommand | Fonctionnel | 7 |
| AnalyzePipelineHandler | **Basique** — 4 groupBy queries seulement | 77 |
| GetPipelineMetricsQuery | Fonctionnel | 7 |
| GetPipelineMetricsHandler | **Basique** — retourne historical + realtime | 34 |
| PipelineMetric entity | Fonctionnel (générique) | 48 |
| IPipelineMetricRepository | 4 méthodes | 13 |
| PrismaPipelineMetricRepository | Fonctionnel mais mapping incorrect | 68 |
| **Sub-agent 7a Collecteur** | **Non implémenté** | 0 |
| **Sub-agent 7b Rapports** | **Non implémenté** | 0 |
| **Sub-agent 7c Anomalies** | **Non implémenté** | 0 |
| **Sub-agent 7d Recommandeur** | **Non implémenté** | 0 |

**Total : 10 fichiers, ~336 lignes. 4 sous-agents entièrement absents.**

---

## AUDIT — 22 bugs identifiés

### Bugs CRITICAL (pipeline cassé)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | `AnalyzePipelineHandler` ne collecte que 4 métriques simples — spec exige ~60 métriques par snapshot | `analyze-pipeline.handler.ts:17-40` | 93% des métriques manquantes |
| **B2** | `metriques_daily` schema Prisma incompatible avec la spec — modèle générique `{metricName, metricValue}` au lieu de 60 colonnes spécifiques | `schema.prisma:MetriquesDaily` | Impossible de stocker le snapshot spec |
| **B3** | Aucun cron configuré — pas de scheduling pour les snapshots/rapports/alertes | Module absent | Agent ne s'exécute jamais automatiquement |
| **B4** | 4 sous-agents (7a, 7b, 7c, 7d) **entièrement absents** | — | 100% des fonctionnalités analytiques manquantes |

### Bugs HIGH

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B5** | Repository utilise `metriquesDaily.findMany` avec `metricName` — mais le Prisma model n'a peut-être pas ce champ en colonne dédiée | `prisma-pipeline-metric.repository.ts:32` | Queries potentiellement cassées |
| **B6** | `AnalyzePipelineHandler` stocke les `groupBy` results comme JSON dans `dimensions` — perd la structure relationnelle | `analyze-pipeline.handler.ts:44-72` | Impossible de faire des requêtes de trending |
| **B7** | `GetPipelineMetricsHandler` retourne des données brutes sans agrégation — spec exige des deltas, tendances, z-scores | `get-pipeline-metrics.handler.ts:9-33` | Dashboard sans insight |
| **B8** | Pas de `Alertes` ni `Recommandations` model dans Prisma schema | `schema.prisma` | Sous-agents 7c et 7d impossibles |
| **B9** | `aggregateByPeriod()` dans repository ne fait PAS d'agrégation — retourne juste un findMany | `prisma-pipeline-metric.repository.ts:53-66` | Pas de weekly/monthly aggregation |
| **B10** | Pas de table `touchpoints` ni `attribution_results` ni `ab_tests` pour les features spec | `schema.prisma` | Attribution, A/B testing impossibles |

### Bugs sécurité

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **S1** | Controller expose les métriques sans vérification de rôle — données business sensibles | `analyste.controller.ts` | N'importe quel utilisateur authentifié voit les KPIs |
| **S2** | Pas de validation Zod sur les paramètres dateFrom/dateTo du controller | `analyste.controller.ts:14,21` | Date invalide → erreur Prisma non gérée |
| **S3** | `agentFilter` dans AnalyzePipelineCommand non validé — potentielle injection SQL via raw query | `analyze-pipeline.handler.ts` | Risque si raw queries ajoutées |
| **S4** | Données Claude API (rapports) contiennent des métriques business sensibles — pas de contrôle d'accès | — | Fuite d'information si Slack mal configuré |

### Gaps spec vs code

| # | Manquant | Spec |
|---|---------|------|
| G1 | **7a Collecteur** : 6 fonctions de collecte (une par agent) + pipeline global + coûts | AGENT-7a |
| G2 | **7b Rapports** : digest quotidien (22h), rapport hebdo (lundi 9h), rapport mensuel (1er) | AGENT-7b |
| G3 | **7c Anomalies** : z-score + seuils fixes, 10 métriques surveillées, alertes Slack | AGENT-7c |
| G4 | **7d Recommandeur** : 5 analyses (templates, scoring, sources, séquences, nurture) + A/B testing | AGENT-7d |
| G5 | **Prisma schema** : metriques_daily avec ~60 colonnes, alertes, recommandations, touchpoints, ab_tests, attribution_results | AGENT-7-MASTER |
| G6 | **Scheduling** : 7 crons (21:30, 21:45, 22:00, lundi 9h/9h30, 1er/mois, hourly) | AGENT-7-MASTER |
| G7 | **Attribution U-Shaped** : 40% first + 40% last + 20% middle touches | AGENT-7-MASTER §5 |
| G8 | **A/B Testing** : significativité statistique (z-score, p-value), evaluation auto des tests en cours | AGENT-7d |
| G9 | **Forecasting** : pipeline coverage, velocity, prévisions 30/60/90j | AGENT-7-MASTER §7 |
| G10 | **Dashboard Metabase** : 7 dashboards spécifiés, requêtes SQL prêtes | AGENT-7-MASTER §8 |
| G11 | **Feedback loop** : recommandations → validation Jonathan → implémentation par agents cibles | AGENT-7d |
| G12 | **Slack integration** : digest #pipeline-metrics, alertes #alerts-critical, DM Jonathan pour CRITICAL | AGENT-7b/7c |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 7 — ANALYSTE
# ══════════════════════════════════════════════
ANALYSTE_ENABLED=true

# Crons
ANALYSTE_SNAPSHOT_CRON=30 21 * * *              # 21:30 quotidien
ANALYSTE_ANOMALY_CRON=45 21 * * *               # 21:45 quotidien
ANALYSTE_DIGEST_CRON=0 22 * * *                 # 22:00 quotidien
ANALYSTE_WEEKLY_CRON=0 9 * * 1                  # Lundi 09:00
ANALYSTE_RECOMMANDATIONS_CRON=30 9 * * 1        # Lundi 09:30
ANALYSTE_MONTHLY_CRON=0 8 1 * *                 # 1er du mois 08:00
ANALYSTE_HOURLY_ANOMALY_CRON=0 * * * *          # Toutes les heures

# Seuils anomalies
ANALYSTE_ZSCORE_WARNING=1.5
ANALYSTE_ZSCORE_CRITICAL=2.5

# Slack
SLACK_CHANNEL_METRICS=#pipeline-metrics
SLACK_CHANNEL_ALERTS=#alerts-critical
SLACK_JONATHAN_ID=                               # Slack user ID pour DM critiques

# Rapports email
ANALYSTE_REPORT_EMAIL=jonathan@axiom-marketing.fr

# Objectifs Phase 1
ANALYSTE_TARGET_REPLY_RATE=5                    # %
ANALYSTE_TARGET_BOUNCE_RATE_MAX=2               # %
ANALYSTE_TARGET_DEALS_WEEK=4
ANALYSTE_TARGET_REVENUE_MONTH=50000             # EUR
ANALYSTE_TARGET_CAC_MAX=500                     # EUR

# Utilise ANTHROPIC_API_KEY (socle commun) pour Claude Sonnet
# Utilise SLACK_WEBHOOK_URL (socle commun) pour Slack
# Utilise GMAIL_* (Agent 5) pour email rapports
```

---

## Roadmap d'Implémentation

### Phase 0 — Schema Prisma + Modèles (1 jour)

- [ ] **B2** : Refactorer `MetriquesDaily` — remplacer le modèle générique par ~60 colonnes spécifiques (spec 7a)
- [ ] **B8** : Ajouter model `Alertes` (spec 7c) avec seuil_type, acknowledged, resolved
- [ ] **B8** : Ajouter model `Recommandations` (spec 7d) avec statut lifecycle (PENDING→APPROVED→IMPLEMENTED)
- [ ] **B10** : Ajouter models `Touchpoints`, `AttributionResults`, `AbTests` (spec §5-6)
- [ ] Migration Prisma

### Phase 1 — 7a Collecteur (1.5 jours)

- [ ] **G1** : `MetricsCollectorService` — 6 fonctions de collecte (une par agent)
- [ ] Collecte pipeline global (deals, revenue, velocity)
- [ ] Collecte coûts (Claude API, APIs externes, infrastructure)
- [ ] `collectDailySnapshot()` — orchestre les 6 collectes en parallèle + upsert metriques_daily
- [ ] Cron `@Cron('30 21 * * *')` pour snapshot quotidien

### Phase 2 — 7c Détecteur d'anomalies (1 jour)

- [ ] **G3** : `AnomalyDetectorService` — z-score + seuils fixes
- [ ] 10 métriques surveillées (reply rate, bounce rate, leads, emails, opt-out, score moyen, distribution HOT, enrichissement, SLA, nurture)
- [ ] Persister anomalies dans `Alertes`
- [ ] Slack alerts : WARNING → #pipeline-metrics, CRITICAL → #alerts-critical + DM Jonathan
- [ ] Cron `@Cron('45 21 * * *')` quotidien + `@Cron('0 * * * *')` hourly

### Phase 3 — 7b Rapports (1.5 jours)

- [ ] **G2** : `ReportGeneratorService`
- [ ] Digest quotidien (22h) : métriques clés + deltas vs veille + health status (VERT/JAUNE/ROUGE)
- [ ] Rapport hebdomadaire (lundi 9h) : agrégation 7j + comparaison semaine précédente + Claude résumé + recommandations
- [ ] Rapport mensuel stratégique (1er du mois) : ROI, funnel complet, scoring précision, A/B tests, attribution, forecasting
- [ ] Envoi via Slack + Email (IEmailAdapter)
- [ ] Claude API pour résumés et recommandations (Sonnet)

### Phase 4 — 7d Recommandeur (1.5 jours)

- [ ] **G4** : `RecommenderService`
- [ ] Analyse templates (Agent 4) — désactiver si reply rate < 3% sur N >= 50
- [ ] Analyse scoring (Agent 3) — recalibration si précision HOT < 30%
- [ ] Analyse sources (Agent 1) — ajuster si 0 conversion sur 30j
- [ ] Analyse séquences (Agent 5) — raccourcir si réponses concentrées étapes 1-3
- [ ] Analyse nurture (Agent 6) — ajuster si sunset > 60%
- [ ] **G8** : A/B Testing — `calculateABTestSignificance()` + `evaluateRunningABTests()`
- [ ] Claude API résumé des recommandations
- [ ] Processus validation : PENDING → Slack notification → APPROVED/REJECTED → IMPLEMENTED
- [ ] Feedback loop : mesurer impact après implémentation (2 semaines)

### Phase 5 — Attribution + Forecasting (1 jour)

- [ ] **G7** : Attribution U-Shaped — 40% first + 40% last + 20% middle
- [ ] Touchpoints tracking — enregistrer chaque point de contact prospect
- [ ] **G9** : Forecasting — pipeline coverage, velocity, prévisions 30/60/90j
- [ ] 3 méthodes : lead-driven, weighted pipeline, moving average

### Phase 6 — Integration + Tests (1 jour)

- [ ] **B3** : Configurer tous les 7 crons dans le module (ScheduleModule) avec locks Redis
- [ ] Mettre à jour AnalysteService pour orchestrer les sous-agents
- [ ] Mettre à jour AnalysteController — nouveaux endpoints (rapports, alertes, recommandations)
- [ ] **S1** : Ajouter @Roles('admin') sur endpoints sensibles
- [ ] **S2** : Validation Zod sur paramètres dates + agentFilter
- [ ] Health check endpoint `/agents/analyste/health`
- [ ] Tests unitaires pour chaque sous-agent
- [ ] Tests intégration pour le flow complet

### Dépendances

```
Phase 0 (schema) — BLOQUANTE
  ↓
Phase 1 (7a collecteur) — BLOQUANTE pour 2+3
  ↓
Phase 2 (7c anomalies) + Phase 3 (7b rapports) — parallélisables
  ↓
Phase 4 (7d recommandeur) — dépend de 1+2+3
  ↓
Phase 5 (attribution + forecasting) — dépend de 0 (schema)
Phase 6 (integration + tests) — dépend de tout
```

---

## Points clés de l'audit final

### Vérifications de cohérence (spec MASTER §10)

| Vérification | Statut |
|-------------|:------:|
| Pipeline linéaire 1→2→3→4→5 + boucle 6→3 + monitoring 7 | VALIDÉ |
| Toutes les tables SQL référencées par Agent 7 existent dans les specs agents source | VALIDÉ |
| 34 KPIs définis avec formules SQL + benchmarks + objectifs | DOCUMENTÉ (07b §10) |
| 18 SQL views exploitables par le collecteur | DOCUMENTÉ (07b §9) |
| Intégration Agents 8, 9, 10 planifiée mais différée | DOCUMENTÉ (07b §8) |
| Volumes réalistes bout en bout | VALIDÉ (spec MASTER §10.3) |
| Coûts Agent 7 : ~50 EUR/mois | DOCUMENTÉ (07b §11) |

### Fonctionnalités brainstormées (10 ajouts possibles)

Documentées dans 07b §12 : real-time anomaly events, agent health monitoring, trend prediction, funnel bottleneck detection, segment-specific reporting, auto-execution recommendations, email deliverability monitoring, LLM cost optimization, data quality scoring, comparative benchmarks.
