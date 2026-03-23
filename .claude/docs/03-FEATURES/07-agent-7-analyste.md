# Agent 7 — ANALYSTE (Master)

## Vue d'Ensemble

L'Agent 7 (ANALYSTE) est le cerveau analytique du pipeline Axiom Marketing. Il ne contacte aucun prospect, n'envoie aucun message, ne modifie aucun scoring. Il mesure la performance de chaque étape du pipeline, détecte les anomalies et les goulots d'étranglement, et recommande des ajustements concrets aux autres agents. Il transforme les données brutes en décisions actionnables pour Jonathan. Coût : ~50 EUR/mois.

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 7a | Collecteur Métriques | Requêtes SQL quotidiennes sur toutes les tables du pipeline, snapshots vers `metriques_daily` | Cron 21h30 + Lun 09h + 1er/mois | Aucune (SQL pur) |
| 7b | Générateur Rapports | Digest quotidien (Slack), rapport hebdomadaire, rapport mensuel stratégique via Claude API | Cron 22h + Lun 09h + 1er/mois | Claude API (claude-sonnet-4-20250514) + Slack API + Gmail API |
| 7c | Détecteur Anomalies | Z-score, seuils glissants, moving averages, alertes Slack critiques en temps réel | Cron 21h45 + continu | Slack API |
| 7d | Recommandeur | Analyse A/B testing (significativité statistique), recommandations ajustements Agents 1/3/4/5/6 après validation Jonathan | Cron Lun 09h30 + 1er/mois | Claude API |

## Input / Output

### Input (depuis toutes les tables du pipeline)

L'Agent 7 n'utilise pas de queue BullMQ. Il collecte ses données via des requêtes SQL planifiées sur toutes les tables des agents 1 à 6 :

| Agent source | Tables principales lues | Métriques dérivées |
|---|---|---|
| Agent 1 VEILLEUR | `leads_bruts`, `signaux_linkedin`, `marches_publics`, `audits_techniques`, `offres_emploi`, `veilleur_batches`, `api_usage` | Volume leads/jour par source, taux leads qualifiés, pré-score moyen, coût API |
| Agent 2 ENRICHISSEUR | `prospects`, `enrichment_log`, `email_verifications` | Taux d'enrichissement par champ, taux email valide, coût par enrichissement |
| Agent 3 SCOREUR | `scores`, `score_history`, `prospect_outcomes`, `blocklists` | Distribution HOT/WARM/COLD/DISQ, précision scoring, volatilité scores |
| Agent 4 RÉDACTEUR | `templates`, `messages_generes`, `ab_tests` | Coût par message, temps génération, performance A/B |
| Agent 5 SUIVEUR | `email_sends`, `reply_classifications`, `prospect_sequences`, `linkedin_actions`, `notifications`, `bounce_events` | Reply rate, bounce rate, taux acceptation LinkedIn, SLA compliance |
| Agent 6 NURTUREUR | `nurture_prospects`, `nurture_interactions`, `nurture_emails` | Taux ouverture nurture, taux reclassification HOT, délai maturation |
| CRM/Business | `prospect_outcomes`, `touchpoints`, `deals` | Win rate, deal moyen, cycle vente, attribution multi-touch |

### Vues SQL existantes exploitées

```
-- Agent 1
v_veilleur_daily_summary, v_marches_actifs

-- Agent 3
score_distribution

-- Agent 5
v_metrics_envoi_daily, v_metrics_reponses, v_conversion_par_segment, v_sla_compliance

-- Agent 6
v_nurture_dashboard_monthly, v_nurture_content_performance, v_nurture_funnel,
v_nurture_engagement_weekly, v_nurture_metrics_daily, v_nurture_conversion_par_segment,
v_nurture_content_perf, v_nurture_sante
```

### Output (vers Agents 1, 3, 4, 5, 6 via recommandations + Jonathan via Slack/email)

- Recommandations d'ajustements (templates, poids scoring, mots-clés, séquences) — soumises à validation Jonathan avant application
- Digest quotidien Slack (22h)
- Rapport hebdomadaire Slack + email (lundi 09h)
- Rapport mensuel stratégique (1er du mois)
- Alertes anomalies Slack en temps réel (7c)

## Workflow

**Étape 1 — Collecte métriques quotidiennes (21h30 — sous-agent 7a)**

Exécution des requêtes SQL KPI quotidiennes sur toutes les tables du pipeline. Snapshots stockés dans `metriques_daily`. Utilisation des vues SQL existantes des autres agents.

**Étape 2 — Détection anomalies (21h45 — sous-agent 7c)**

Scan du snapshot quotidien avec :
- Z-score sur chaque KPI vs moyenne mobile 30 jours (alerte si |z| > 2)
- Seuils absolus (ex : bounce rate > 5% = CRITIQUE)
- Comparaison vs J-7 et vs mois précédent
- Alertes Slack immédiates sur channel `#axiom-alertes` classées CRITIQUE / WARNING / INFO

**Étape 3 — Génération digest quotidien (22h00 — sous-agent 7b)**

Digest texte structuré (pas de Claude API) envoyé sur Slack `#axiom-daily` :
```
DIGEST QUOTIDIEN — [date]
Leads bruts : 42 (+8 vs hier)
Reply rate : 5.2% (+0.4pp)
Bounces : 1.2% (OK)
Alertes actives : 1 WARNING
```

**Étape 4 — Rapport hebdomadaire (lundi 09h00 — 7a + 7b)**

Claude API génère un rapport structuré avec :
- Résumé de performance (7 KPIs headline)
- Évolution vs semaine précédente
- Détail par segment (pme_metro, ecommerce_shopify, etc.)
- Attribution multi-touch U-Shaped (40% premier + 40% dernier + 20% intermédiaire)
- Prévisions pipeline 30 jours (3 méthodes : Lead-Driven, Weighted Pipeline, Moving Average)

**Étape 5 — Recommandations hebdomadaires (lundi 09h30 — sous-agent 7d)**

Analyse des tests A/B en cours (significativité statistique à 95%). Génération de recommandations concrètes pour chaque agent. Envoi notification Slack à Jonathan pour validation. Les agents n'appliquent les changements qu'après approbation.

**Étape 6 — Rapport mensuel stratégique (1er du mois — 7a + 7b + 7d)**

- Tous les 34 KPIs avec formules SQL et benchmarks
- Attribution revenue par canal, par template, par agent
- Forecasting 30/60/90 jours (Conservative / Moderate / Optimiste)
- Pipeline coverage ratio (cible : 3x le quota mensuel 50 000 EUR)
- Calibration scoring : précision HOT vs résultats réels, recommandation recalibration des poids
- Budget API consommé vs alloué par agent

## APIs & Coûts

| API | Coût/mois | Utilisation |
|-----|-----------|-------------|
| Claude API (claude-sonnet-4-20250514) | ~30 EUR | ~50 appels/mois (rapports + recommandations) |
| Slack API | 0 EUR | Free plan — alertes + digests |
| Gmail API | 0 EUR | Envoi rapports email — inclus Google Workspace |
| Metabase self-hosted | ~10 EUR | Part serveur Docker |
| Infrastructure cron workers + Redis | ~10 EUR | Part VPS partagé |

**Total Agent 7 : ~50 EUR/mois**

Détail Claude API :
- Rapport hebdo : ~$0.03 × 4 = $0.12/mois (~0.11 EUR)
- Rapport mensuel : ~$0.06/mois (~0.055 EUR)
- Recommandations (4/mois) : ~$0.017 × 4 = $0.068/mois (~0.063 EUR)
- Digest quotidien : 0 EUR (code pur, pas de Claude API)
- Budget total avec marge ad-hoc : ~30 EUR/mois

## Base de Données

### Tables Principales

```sql
-- Snapshot métriques quotidiennes (toutes les métriques du pipeline)
CREATE TABLE metriques_daily (
  id                      SERIAL PRIMARY KEY,
  date_snapshot           DATE NOT NULL UNIQUE,
  -- Agent 1 métriques
  veilleur_leads_bruts    INTEGER DEFAULT 0,
  veilleur_leads_qualifies INTEGER DEFAULT 0,
  veilleur_taux_dedup     NUMERIC(5,2) DEFAULT 0,
  veilleur_cout_api_eur   NUMERIC(8,2) DEFAULT 0,
  -- Agent 2 métriques
  enrichisseur_taux_email NUMERIC(5,2) DEFAULT 0,
  enrichisseur_taux_valide NUMERIC(5,2) DEFAULT 0,
  enrichisseur_temps_moyen_ms INTEGER DEFAULT 0,
  -- Agent 3 métriques
  scoreur_pct_hot         NUMERIC(5,2) DEFAULT 0,
  scoreur_precision_hot   NUMERIC(5,2) DEFAULT 0,
  scoreur_score_moyen     NUMERIC(5,2) DEFAULT 0,
  -- Agent 4 métriques
  redacteur_cout_msg_usd  NUMERIC(6,4) DEFAULT 0,
  redacteur_temps_gen_ms  INTEGER DEFAULT 0,
  -- Agent 5 métriques
  suiveur_emails_envoyes  INTEGER DEFAULT 0,
  suiveur_reply_rate      NUMERIC(5,2) DEFAULT 0,
  suiveur_bounce_rate     NUMERIC(5,2) DEFAULT 0,
  suiveur_reponses_total  INTEGER DEFAULT 0,
  suiveur_reponses_positives INTEGER DEFAULT 0,
  suiveur_linkedin_accept NUMERIC(5,2) DEFAULT 0,
  -- Agent 6 métriques
  nurture_ouverture       NUMERIC(5,2) DEFAULT 0,
  nurture_clic            NUMERIC(5,2) DEFAULT 0,
  nurture_reclassif_hot   INTEGER DEFAULT 0,
  -- Pipeline global
  pipeline_deals_gagnes   INTEGER DEFAULT 0,
  pipeline_revenu_jour    NUMERIC(10,2) DEFAULT 0,
  cout_total_jour_eur     NUMERIC(8,2) DEFAULT 0,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Alertes détectées par 7c
CREATE TABLE alertes (
  id                  SERIAL PRIMARY KEY,
  date_alerte         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  niveau              VARCHAR(10) NOT NULL CHECK (niveau IN ('CRITIQUE','WARNING','INFO')),
  agent_source        VARCHAR(20) NOT NULL,
  kpi_nom             VARCHAR(100) NOT NULL,
  valeur_actuelle     NUMERIC,
  valeur_seuil        NUMERIC,
  z_score             NUMERIC(5,2),
  message             TEXT NOT NULL,
  statut              VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (statut IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  resolved_at         TIMESTAMP WITH TIME ZONE,
  slack_message_id    VARCHAR(50)
);

-- Recommandations générées par 7d
CREATE TABLE recommandations (
  id                  SERIAL PRIMARY KEY,
  date_creation       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  agent_cible         VARCHAR(20) NOT NULL,
  type_recommandation VARCHAR(50) NOT NULL,
    -- 'template_update', 'scoring_weight', 'sequence_change', 'keyword_blacklist', 'budget_reallocation'
  priorite            VARCHAR(10) NOT NULL CHECK (priorite IN ('HAUTE','MOYENNE','BASSE')),
  description         TEXT NOT NULL,
  impact_estime       TEXT,
  statut              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (statut IN ('PENDING','APPROVED','REJECTED','APPLIED')),
  approved_by         VARCHAR(20),
  approved_at         TIMESTAMP WITH TIME ZONE,
  applied_at          TIMESTAMP WITH TIME ZONE
);

-- Attribution multi-touch
CREATE TABLE touchpoints (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID NOT NULL,
  lead_id             UUID NOT NULL,
  channel             VARCHAR(50) NOT NULL,
  touchpoint_type     VARCHAR(100) NOT NULL,
  agent_source        VARCHAR(30) NOT NULL,
  template_id         VARCHAR(100),
  ab_variant          VARCHAR(5),
  signal_type         VARCHAR(50),
  segment             VARCHAR(30),
  scoring_categorie   VARCHAR(20),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE attribution_results (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID NOT NULL,
  model_name          VARCHAR(30) NOT NULL,
    -- 'u_shaped', 'time_decay', 'linear', 'first_touch', 'last_touch'
  touchpoint_id       INTEGER REFERENCES touchpoints(id),
  channel             VARCHAR(50),
  agent_source        VARCHAR(30),
  template_id         VARCHAR(100),
  credit_pct          NUMERIC(5,2) NOT NULL,
  revenue_attributed  NUMERIC(12,2),
  calculated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- A/B tests (table complète de l'Analyste)
CREATE TABLE ab_tests (
  id                        SERIAL PRIMARY KEY,
  test_id                   VARCHAR(100) NOT NULL UNIQUE,
  test_name                 VARCHAR(200) NOT NULL,
  element_teste             VARCHAR(50) NOT NULL,
    -- 'subject_line', 'hook', 'cta', 'body_length', 'send_time', 'sequence_length'
  template_control_id       VARCHAR(100) NOT NULL,
  template_challenger_id    VARCHAR(100) NOT NULL,
  segment_cible             VARCHAR(30),
  categorie_cible           VARCHAR(20),
  statut                    VARCHAR(20) DEFAULT 'RUNNING'
    CHECK (statut IN ('RUNNING','CONCLUDED','PAUSED','CANCELLED')),
  date_debut                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date_fin                  TIMESTAMP WITH TIME ZONE,
  taille_min_par_variante   INTEGER DEFAULT 250,
  envois_a                  INTEGER DEFAULT 0,
  envois_b                  INTEGER DEFAULT 0,
  replies_a                 INTEGER DEFAULT 0,
  replies_b                 INTEGER DEFAULT 0,
  reply_rate_a              NUMERIC(5,2) DEFAULT 0,
  reply_rate_b              NUMERIC(5,2) DEFAULT 0,
  z_score                   NUMERIC(5,2),
  p_value                   NUMERIC(5,4),
  gagnant                   VARCHAR(5),     -- 'A', 'B', 'TIE'
  confiance_resultat        NUMERIC(5,2),
  recommandation            TEXT,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Scheduling

| Cron | Heure | Sous-agent | Action |
|------|-------|------------|--------|
| `30 21 * * *` | 21h30 | 7a Collecteur | Snapshot métriques quotidiennes |
| `45 21 * * *` | 21h45 | 7c Détecteur | Scan anomalies sur snapshot |
| `0 22 * * *` | 22h00 | 7b Générateur | Digest quotidien Slack + email |
| `0 9 * * 1` | Lun 09h00 | 7a + 7b | Rapport hebdomadaire complet |
| `30 9 * * 1` | Lun 09h30 | 7d Recommandeur | Recommandations hebdo |
| `0 9 1 * *` | 1er/mois 09h | 7a + 7b + 7d | Rapport mensuel stratégique |
| Continu | — | 7c Détecteur | Alertes anomalies critiques (event-driven) |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Requête SQL timeout (> 30s) | Retry 2x avec backoff 5s | Skip la métrique, log `sql_timeout_kpi_[nom]` |
| Claude API indisponible (rapport) | Retry 3x backoff exponentiel | Envoyer rapport avec données brutes sans narration Claude |
| Slack API rate limit | Queue les messages, envoi différé 5 min | Log `slack_rate_limited` |
| Z-score calculé sur < 7 jours de données | Utiliser seuils absolus uniquement | Log `insufficient_data_zscore` |
| Vue SQL manquante (agent pas encore déployé) | Skip les métriques de l'agent concerné | Log `missing_view_agent_X` |
| Snapshot déjà existant pour la date (doublon cron) | Upsert plutôt qu'insert | Log `duplicate_snapshot` |
| Recommandation approuvée mais agent cible indisponible | Conserver en `APPROVED`, retenter dans 24h | Alerte Slack Jonathan |

## KPIs & Métriques

### Tableau complet des 34 KPIs avec benchmarks

| # | KPI | Formule SQL simplifiée | Benchmark marché | Objectif Phase 1 | Objectif Phase 2 |
|---|-----|----------------------|------------------|------------------|------------------|
| **VEILLEUR** | | | | | |
| 1 | Leads bruts / jour | `COUNT(*) FROM leads_bruts WHERE DATE(created_at) = CURRENT_DATE` | N/A | 30-80 | 80-200 |
| 2 | Leads qualifiés / jour | `COUNT(*) WHERE pre_score >= 60` | N/A | 8-20 | 20-60 |
| 3 | Taux déduplication | `COUNT(dedup) / COUNT(total) * 100` | 10-25% | 10-25% | 10-20% |
| 4 | Coût par lead brut | `cout_api_mensuel / leads_bruts_mensuel` | N/A | 0.18-0.48 EUR | < 0.15 EUR |
| **ENRICHISSEUR** | | | | | |
| 5 | Taux enrichissement email | `COUNT(email NOT NULL) / COUNT(*) * 100` | 60-80% | >= 70% | >= 80% |
| 6 | Taux email valide | `COUNT(result='valid') / COUNT(*) * 100` | 80-90% | >= 85% | >= 90% |
| 7 | Temps moyen enrichissement | `AVG(EXTRACT(ms FROM enriched_at - created_at))` | < 10s | < 10s | < 5s |
| **SCOREUR** | | | | | |
| 8 | Distribution HOT | `COUNT(categorie='HOT') / COUNT(*) * 100` | 5-15% | ~10% | Ajusté selon data |
| 9 | Précision HOT | `COUNT(outcome IN ('converti','opportunite') AND cat='HOT') / COUNT(cat='HOT') * 100` | 25-35% | >= 30% | >= 40% |
| 10 | Recall | `COUNT(outcome='converti' AND cat='HOT') / COUNT(outcome='converti') * 100` | 50-70% | >= 60% | >= 75% |
| 11 | Faux positifs HOT | `COUNT(outcome='pas_de_reponse' AND cat='HOT') / COUNT(cat='HOT') * 100` | 30-50% | < 40% | < 25% |
| 12 | Score moyen des deals | `AVG(score_at_contact) WHERE outcome = 'converti'` | 60-80 | >= 65 | >= 70 |
| **RÉDACTEUR** | | | | | |
| 13 | Coût par message généré | `SUM(generation_cost_usd) / COUNT(*)` | $0.01-0.03 | < $0.02 | < $0.015 |
| 14 | Templates actifs | `COUNT(DISTINCT template_id) WHERE status = 'active'` | 3-10 | 5-8 | 8-15 |
| 15 | A/B tests en cours | `COUNT(DISTINCT ab_test_id) WHERE status = 'running'` | 1-3 | 1-2 | 2-4 |
| **SUIVEUR** | | | | | |
| 16 | Reply rate | `COUNT(reply) / COUNT(email_sent) * 100` | 3.43% moyen, 5-10% bon | >= 5% | >= 8% |
| 17 | Taux réponse positive | `COUNT(INTERESSE+INTERESSE_SOFT) / COUNT(email_sent) * 100` | 1-3% | >= 2% | >= 4% |
| 18 | Taux de bounce | `COUNT(status='BOUNCED') / COUNT(*) * 100` | < 2% | < 2% | < 1% |
| 19 | Taux d'opt-out | `COUNT(type='opt_out') / COUNT(DISTINCT prospect_id) * 100` | 0.1-0.3% | < 0.5% | < 0.2% |
| 20 | SLA compliance | `COUNT(sla_ok) / COUNT(*) * 100 FROM notifications` | > 90% | > 90% | > 95% |
| 21 | LinkedIn acceptance rate | `COUNT(result='accepted') / COUNT(*) * 100 WHERE action_type='connection_sent'` | 20-40% | >= 25% | >= 35% |
| **NURTUREUR** | | | | | |
| 22 | Taux ouverture nurture | `COUNT(status IN (OPENED,CLICKED,REPLIED)) / COUNT(*) * 100` | 20-30% | >= 25% | >= 30% |
| 23 | Taux clic nurture | `COUNT(status IN (CLICKED,REPLIED)) / COUNT(*) * 100` | 3-5% | >= 4% | >= 6% |
| 24 | Taux reclassification HOT | `COUNT(nurture_status='RECLASSIFIED_HOT') / COUNT(*) * 100` | 3-8% | >= 5% | >= 8% |
| 25 | Délai maturation moyen | `AVG(EXTRACT(days FROM updated_at - created_at)) WHERE nurture_status='RECLASSIFIED_HOT'` | 60-120 jours | < 90 jours | < 60 jours |
| 26 | Taux sunset | `COUNT(nurture_status='SUNSET') / COUNT(*) * 100` | 40-60% | < 60% | < 45% |
| **PIPELINE GLOBAL** | | | | | |
| 27 | Conversion end-to-end | `deals_gagnes / leads_bruts * 100` | 2-5% | >= 2% | >= 4% |
| 28 | CAC | `couts_mensuels_total / deals_gagnes` | 800-2000 EUR | < 500 EUR | < 300 EUR |
| 29 | Pipeline velocity | `(opportunities × avg_deal × win_rate) / cycle_days` | Variable | >= 500 EUR/jour | >= 1500 EUR/jour |
| 30 | Pipeline coverage ratio | `pipeline_value / monthly_target (50 000 EUR)` | 3-4x | >= 3x | >= 4x |
| 31 | Win rate | `deals_gagnes / (deals_gagnes + deals_perdus) * 100` | 8.8% (agences web) | >= 15% | >= 25% |
| 32 | Cycle de vente moyen | `AVG(cycle_vente_jours) WHERE outcome = 'converti'` | 30-90 jours | < 45 jours | < 30 jours |
| 33 | Deal moyen | `AVG(montant_deal) WHERE outcome = 'converti'` | 5K-15K EUR | >= 8K EUR | >= 12K EUR |
| 34 | ROI mensuel | `revenu_mensuel / couts_mensuels` | Variable | >= 10x | >= 25x |

## Edge Cases

- **Données insuffisantes pour le z-score** : Si moins de 7 jours de snapshots disponibles pour un KPI, l'Agent 7 utilise uniquement les seuils absolus. Log `insufficient_history_zscore`. Le z-score devient opérationnel à J+7 du lancement
- **Agent en cours de déploiement** : Si une table cible n'existe pas encore (`vue_manquante`), l'Analyste skip silencieusement les métriques correspondantes et les note comme `N/A` dans le rapport
- **A/B test avec moins de 250 envois par variante** : L'Analyste ne conclut jamais avant le minimum statistique requis (250 par variante, 4 semaines minimum). Il signale uniquement la progression
- **Anomalie détectée la veille d'un week-end** : Les alertes CRITIQUE sont envoyées immédiatement ; les alertes WARNING sont regroupées dans le digest du lundi
- **Recommandation contradictoire entre agents** : Ex. Agent 7 recommande d'augmenter la fréquence d'envoi (Agent 5) mais aussi de diminuer le budget API (Agent 4). Jonathan arbitre via le formulaire Slack de validation
- **Coût total système dépasse le budget** : L'Agent 7 alerte Jonathan en CRITIQUE avec détail par agent. Pas d'action automatique sur les budgets sans validation humaine

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Claude API (rapports + recommandations) | ~30 EUR |
| Slack API | 0 EUR |
| Gmail API (rapports email) | 0 EUR |
| Metabase self-hosted (Docker) | ~10 EUR |
| Infrastructure (cron workers, Redis part) | ~10 EUR |
| **Total** | **~50 EUR/mois** |

**Coût total système complet (10 agents) : ~1 175 EUR/mois** (Agent 1 : 430 EUR / Agent 2 : 180 EUR / Agent 3 : 0 EUR / Agent 4 : 25 EUR / Agent 5 : 150 EUR / Agent 6 : 37 EUR / Agent 7 : 50 EUR / Infrastructure partagée : 60 EUR)

## Référence Spec

`.claude/source-ia/agent/AGENT-7-MASTER.md`
Sous-agents détaillés : `AGENT-7a-COLLECTEUR.md`, `AGENT-7b-RAPPORTS.md`, `AGENT-7c-ANOMALIES.md`, `AGENT-7d-RECOMMANDEUR.md`
