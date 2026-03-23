# AGENT 7 — ANALYSTE (MASTER)
**Fichiers associes** : AGENT-7a-COLLECTEUR.md, AGENT-7b-RAPPORTS.md, AGENT-7c-ANOMALIES.md, AGENT-7d-RECOMMANDEUR.md
**Position** : Recoit metriques de TOUS les agents
**Cout** : ~50 EUR/mois

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B multicanal (10 agents)
**Public :** Jonathan Dewaele, Marty Wong, equipe tech Univile
**Statut :** DERNIER AGENT -- Ce document boucle le systeme complet

---

## TABLE DES MATIERES

1. [Mission](#1-mission)
2. [Input : Sources de donnees](#2-input--sources-de-donnees)
3. [Sous-Agents](#3-sous-agents)
4. [KPIs par etape](#4-kpis-par-etape)
5. [Attribution multi-touch](#5-attribution-multi-touch)
6. [A/B Testing](#6-ab-testing)
7. [Forecasting](#7-forecasting)
8. [Dashboard](#8-dashboard)
9. [Couts](#9-couts)
10. [Verification de coherence globale](#10-verification-de-coherence-globale)
11. [Integration avec les Agents 8, 9, 10](#11-integration-avec-les-agents-8-9-10)

---

## 1. MISSION

### 1.1 Definition

L'Agent 7 (ANALYSTE) est le **cerveau analytique** du pipeline Axiom Marketing. Il ne contacte aucun prospect, n'envoie aucun message, ne modifie aucun scoring, ne touche a aucun template. Il **MESURE** la performance de chaque etape du pipeline, **DETECTE** les anomalies et les goulots d'etranglement, et **RECOMMANDE** des ajustements concrets aux 6 autres agents. C'est l'agent qui transforme les donnees brutes en decisions actionnables pour Jonathan.

### 1.2 Position dans le pipeline

```
Agent 1 (VEILLEUR) --> Agent 2 (ENRICHISSEUR) --> Agent 3 (SCOREUR)
                                                       |
                                                       v
                                              Agent 4 (REDACTEUR)
                                                       |
                                                       v
                                              Agent 5 (SUIVEUR)
                                                       |
                                              +--------+--------+
                                              |                 |
                                              v                 v
                                     Agent 6 (NURTUREUR)        |
                                              |                 |
                                              +--------+--------+
                                                       |
                                                       v
                                      ===================================
                                      |  AGENT 7 (ANALYSTE)             |
                                      |  - Collecte metriques (7a)      |
                                      |  - Genere rapports (7b)         |
                                      |  - Detecte anomalies (7c)       |
                                      |  - Recommande ajustements (7d)  |
                                      ===================================
                                                       |
                                              +--------+--------+--------+--------+
                                              |        |        |        |        |
                                              v        v        v        v        v
                                          Agent 1  Agent 3  Agent 4  Agent 5  Agent 6
                                       (feedback) (feedback) (feedback) (feedback) (feedback)
```

### 1.3 Responsabilites exactes

| Responsabilite | Agent 7 fait | Autres agents font |
|---|---|---|
| **Collecte metriques** | Requetes SQL quotidiennes sur TOUTES les tables du pipeline | Chaque agent produit ses propres metriques brutes |
| **Generation rapports** | Digest quotidien, rapport hebdo, rapport mensuel | -- |
| **Detection anomalies** | Z-score, seuils, moving averages, alertes Slack | -- |
| **Recommandations** | Ajustements concrets pour chaque agent (templates, poids, mots-cles) | Les agents implementent les recommandations apres validation Jonathan |
| **Attribution** | Modele multi-touch pour tracker la contribution de chaque canal/template/signal | -- |
| **A/B Testing** | Analyse resultats, significativite statistique, recommandations automatiques | Agent 4 cree les variantes, Agent 5 les envoie |
| **Forecasting** | Previsions pipeline 30/60/90 jours, pipeline coverage ratio | -- |
| **Calibration scoring** | Compare predictions vs realite, recommande recalibration des poids | Agent 3 applique les nouveaux poids |

### 1.4 Ce que l'Analyste ne fait PAS

- Ne contacte AUCUN prospect (responsabilite Agents 4/5/6)
- Ne modifie PAS directement les poids du scoring (responsabilite Agent 3 -- il recommande seulement)
- Ne desactive PAS directement les templates (responsabilite Agent 4 -- il recommande seulement)
- Ne change PAS les sequences d'envoi (responsabilite Agent 5 -- il recommande seulement)
- Ne detecte PAS les signaux d'achat (responsabilite Agent 1)
- Ne prend PAS de decisions commerciales (responsabilite de Jonathan)
- Ne fait PAS de modifications sans validation humaine prealable

### 1.5 Les 5 segments cibles Axiom

| Segment | Cible | Decideurs vises | Taille |
|---------|-------|-----------------|--------|
| `pme_metro` | PME France metropolitaine | DG, CMO, DSI, CTO | 50-500 salaries |
| `ecommerce_shopify` | E-commercants Shopify | Fondateurs, Head of Growth | Toutes tailles |
| `collectivite` | Collectivites DOM-TOM | DGS, DSI, elus numeriques | N/A |
| `startup` | Startups / SaaS | Founders, CTO | 5-200 salaries |
| `agence_wl` | Agences en marque blanche | Fondateurs agences marketing/SEO | 2-50 salaries |

### 1.6 Caracteristiques techniques

| Propriete | Valeur |
|-----------|--------|
| Sous-agents | 4 (Collecteur, Generateur, Detecteur, Recommandeur) |
| APIs externes | Claude API (generation rapports + recommandations) |
| Base de donnees | PostgreSQL 16 (lecture sur TOUTES les tables + ecriture `metriques_daily`, `alertes`, `recommandations`) |
| Queue d'entree | Aucune (cron-based, pas d'entree pipeline) |
| Queue de sortie | Aucune (output = rapports Slack/email + recommandations) |
| Frequence | Quotidien (22h), hebdomadaire (lundi 9h), mensuel (1er du mois) |
| Cache | Redis (metriques recentes, snapshots) |
| Notifications | Slack API + Gmail API |
| BI/Dashboard | Metabase (self-hosted) |

---

## 2. INPUT : SOURCES DE DONNEES

### 2.1 Vue d'ensemble des sources

L'Analyste collecte ses donnees depuis TOUTES les tables SQL du pipeline. Il ne recoit pas de donnees via une queue BullMQ -- il va les chercher lui-meme via des requetes SQL planifiees.

### 2.2 Donnees par agent

#### Agent 1 -- VEILLEUR

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `leads_bruts` | Nombre de leads detectes, source_primaire, segment_estime, pre_score, statut | Volume quotidien par source, taux de leads qualifies, pre-score moyen |
| `signaux_linkedin` | Type de signal, tier, date | Volume signaux par type, fraicheur |
| `marches_publics` | Nombre detectes, score_pertinence, action | Marches pertinents/jour, taux de qualification |
| `audits_techniques` | Scores Lighthouse, stack, tier | Sites audites/jour, score moyen, distribution tiers |
| `offres_emploi` | Score pertinence, plateforme, budget_estime | Offres pertinentes/jour, budget moyen estime |
| `deduplication_log` | Nombre de duplicats, match_type | Taux de deduplication, sources croisees |
| `veilleur_batches` | nb_leads_bruts, duree, erreurs | Temps de traitement, taux d'erreur |
| `api_usage` | Credits consommes, couts, provider | Budget API consomme vs alloue |

#### Agent 2 -- ENRICHISSEUR

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `prospects` | Champs enrichis (email, telephone, siret, ca, effectif) | Taux d'enrichissement par champ |
| `enrichment_log` | APIs appelees, resultats, temps de traitement | Taux de succes par API, cout par enrichissement |
| `email_verifications` | Emails valides/invalides, catch-all | Taux de delivrabilite email |

#### Agent 3 -- SCOREUR

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `scores` | score_total, categorie, sous_categorie, segment_primaire, axes 1-4 | Distribution HOT/WARM/COLD/DISQ, score moyen par segment |
| `score_history` | ancien_score, nouveau_score, raison | Volatilite des scores, reclassifications |
| `prospect_outcomes` | outcome (converti/interesse/pas_de_reponse), montant_deal | Precision scoring, faux positifs/negatifs |
| `blocklists` | Type, valeur | Taille et evolution des blocklists |

#### Agent 4 -- REDACTEUR

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `templates` | template_id, version, status (control/challenger) | Nombre de templates actifs, rotation |
| `messages_generes` | template utilise, personnalisation, cout generation | Cout par message, temps de generation |
| `ab_tests` | variante A/B, resultats | Performance comparee des variantes |

#### Agent 5 -- SUIVEUR

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `email_sends` | canal, domaine_envoi, categorie, segment, status (SENT/BOUNCED/FAILED) | Emails envoyes/jour, taux de bounce, par domaine |
| `reply_classifications` | category (INTERESSE/PAS_MAINTENANT/etc.), confidence, sentiment | Taux de reponse, distribution des reponses, par categorie scoring |
| `prospect_sequences` | sequence_status, current_step, total_steps | Sequences actives, completees, stoppees |
| `linkedin_actions` | action_type, result | Taux d'acceptation LinkedIn, messages envoyes |
| `notifications` | type, priority, read_at, sla_deadline, escalated | SLA compliance, temps moyen traitement |
| `bounce_events` | bounce_type (hard/soft), domaine | Sante des domaines d'envoi |
| `rgpd_events` | type (opt_out, suppression) | Taux d'opt-out |

#### Agent 6 -- NURTUREUR

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `nurture_prospects` | nurture_status, engagement_score_current, segment, parcours_etape | Total en nurture, distribution par statut |
| `nurture_interactions` | interaction_type, canal, score_delta | Volume interactions, impact engagement |
| `nurture_emails` | status (SENT/OPENED/CLICKED/REPLIED), content_piece_id | Taux ouverture/clic nurture, performance contenu |

#### CRM / Donnees business

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `prospect_outcomes` | outcome, montant_deal, canal_conversion, cycle_vente_jours | Win rate, deal moyen, cycle de vente |
| `touchpoints` | channel, touchpoint_type, timestamp | Attribution multi-touch, parcours client |
| `deals` | stage, valeur, date_creation, date_close | Pipeline value, velocity |

### 2.3 Vues SQL existantes exploitees par l'Analyste

Les autres agents ont deja cree des vues SQL que l'Analyste utilise directement :

```
-- Agent 1 (VEILLEUR)
v_veilleur_daily_summary          -- Resume quotidien des leads
v_marches_actifs                  -- Marches publics en cours

-- Agent 3 (SCOREUR)
score_distribution                -- Distribution des scores sur 30 jours

-- Agent 5 (SUIVEUR)
v_metrics_envoi_daily             -- Metriques envoi par jour/canal/domaine
v_metrics_reponses                -- Metriques reponses par categorie
v_conversion_par_segment          -- Taux conversion par segment
v_sla_compliance                  -- Respect des SLAs

-- Agent 6 (NURTUREUR)
v_nurture_dashboard_monthly       -- Synthese nurture mensuelle
v_nurture_content_performance     -- Performance par contenu
v_nurture_funnel                  -- Entonnoir nurture
v_nurture_engagement_weekly       -- Engagement par semaine
v_nurture_metrics_daily           -- Metriques nurture quotidiennes
v_nurture_conversion_par_segment  -- Conversion nurture par segment
v_nurture_content_perf            -- Performance detaillee contenu
v_nurture_sante                   -- Indicateurs sante globale
```

---

## 3. SOUS-AGENTS

### 3.1 Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AGENT 7 -- ANALYSTE                                   │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  7a          │  │  7b          │  │  7c          │  │  7d          │       │
│  │  Collecteur  │  │  Generateur  │  │  Detecteur   │  │  Recommandeur│       │
│  │  Metriques   │  │  Rapports    │  │  Anomalies   │  │              │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │                │
│         │ SQL quotidien  │ Claude API     │ Z-score        │ Claude API    │
│         │ toutes tables  │ + Slack/email  │ + seuils       │ + actions     │
│         │                │                │ + alertes      │ concretes     │
│         └────────────────┴───────┬────────┴────────────────┘                │
│                                  │                                          │
│                    ┌─────────────▼──────────────┐                          │
│                    │ metriques_daily (BDD)       │                          │
│                    │ alertes (BDD + Slack)       │                          │
│                    │ recommandations (BDD)       │                          │
│                    │ rapports (Slack + email)    │                          │
│                    └────────────────────────────┘                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

> **Detail des sous-agents** : voir AGENT-7a-COLLECTEUR.md, AGENT-7b-RAPPORTS.md, AGENT-7c-ANOMALIES.md, AGENT-7d-RECOMMANDEUR.md

### 3.2 Scheduling global

```
┌──────────────────────────────────────────────────────────────────────┐
│ PLANNING QUOTIDIEN DE L'ANALYSTE                                     │
├──────────┬──────────────────────────┬────────────────────────────────┤
│ Heure    │ Sous-agent               │ Action                         │
├──────────┼──────────────────────────┼────────────────────────────────┤
│ 21:30    │ 7a Collecteur            │ Snapshot metriques quotidiennes │
│ 21:45    │ 7c Detecteur             │ Scan anomalies sur snapshot    │
│ 22:00    │ 7b Generateur            │ Digest quotidien Slack + email │
│ Lun 09:00│ 7a + 7b                  │ Rapport hebdomadaire complet   │
│ Lun 09:30│ 7d Recommandeur          │ Recommandations hebdo          │
│ 1er/mois │ 7a + 7b + 7d             │ Rapport mensuel strategique    │
│ Continu  │ 7c Detecteur             │ Alertes anomalies critiques    │
└──────────┴──────────────────────────┴────────────────────────────────┘
```

---

## 4. KPIs PAR ETAPE

### 4.1 Tableau complet des KPIs avec benchmarks et objectifs

| # | KPI | Formule SQL | Benchmark marche | Objectif Axiom Phase 1 | Objectif Axiom Phase 2 |
|---|-----|-----------|------------------|------------------------|------------------------|
| **VEILLEUR** | | | | | |
| 1 | Leads bruts / jour | `SELECT COUNT(*) FROM leads_bruts WHERE DATE(created_at) = CURRENT_DATE` | N/A | 30-80 | 80-200 |
| 2 | Leads qualifies / jour | `SELECT COUNT(*) FROM leads_bruts WHERE DATE(created_at) = CURRENT_DATE AND pre_score >= 60` | N/A | 8-20 | 20-60 |
| 3 | Taux de deduplication | `SELECT COUNT(dedup) / (COUNT(leads) + COUNT(dedup)) * 100` | 10-25% | 10-25% | 10-20% |
| 4 | Cout par lead brut | `cout_api_mensuel / leads_bruts_mensuel` | N/A | 0.18-0.48 EUR | < 0.15 EUR |
| **ENRICHISSEUR** | | | | | |
| 5 | Taux enrichissement email | `COUNT(email IS NOT NULL) / COUNT(*) * 100 FROM prospects WHERE statut = 'enrichi'` | 60-80% | >= 70% | >= 80% |
| 6 | Taux email valide | `COUNT(result='valid') / COUNT(*) * 100 FROM email_verifications` | 80-90% | >= 85% | >= 90% |
| 7 | Temps moyen enrichissement | `AVG(EXTRACT(ms FROM enriched_at - created_at)) FROM enrichment_log` | < 10s | < 10s | < 5s |
| **SCOREUR** | | | | | |
| 8 | Distribution HOT | `COUNT(categorie='HOT') / COUNT(*) * 100 FROM scores` | 5-15% | ~10% | Ajuste selon data |
| 9 | Precision HOT | `COUNT(outcome IN ('converti','opportunite') AND categorie='HOT') / COUNT(categorie='HOT') * 100` | 25-35% | >= 30% | >= 40% |
| 10 | Recall | `COUNT(outcome='converti' AND categorie='HOT') / COUNT(outcome='converti') * 100` | 50-70% | >= 60% | >= 75% |
| 11 | Faux positifs HOT | `COUNT(outcome='pas_de_reponse' AND categorie='HOT') / COUNT(categorie='HOT') * 100` | 30-50% | < 40% | < 25% |
| 12 | Score moyen des deals | `AVG(score_at_contact) FROM prospect_outcomes WHERE outcome = 'converti'` | 60-80 | >= 65 | >= 70 |
| **REDACTEUR** | | | | | |
| 13 | Cout par message genere | `SUM(generation_cost_usd) / COUNT(*) FROM messages_generes` | $0.01-0.03 | < $0.02 | < $0.015 |
| 14 | Templates actifs | `COUNT(DISTINCT template_id) WHERE status = 'active'` | 3-10 | 5-8 | 8-15 |
| 15 | A/B tests en cours | `COUNT(DISTINCT ab_test_id) WHERE status = 'running'` | 1-3 | 1-2 | 2-4 |
| **SUIVEUR** | | | | | |
| 16 | Taux de reponse (reply rate) | `COUNT(reply) / COUNT(email_sent) * 100` | 3.43% moyen, 5-10% bon | >= 5% | >= 8% |
| 17 | Taux reponse positive | `COUNT(reply IN ('INTERESSE','INTERESSE_SOFT')) / COUNT(email_sent) * 100` | 1-3% | >= 2% | >= 4% |
| 18 | Taux de bounce | `COUNT(status='BOUNCED') / COUNT(*) * 100 FROM email_sends` | < 2% | < 2% | < 1% |
| 19 | Taux d'opt-out | `COUNT(type='opt_out') / COUNT(DISTINCT prospect_id) * 100` | 0.1-0.3% | < 0.5% | < 0.2% |
| 20 | SLA compliance | `COUNT(sla_ok) / COUNT(*) * 100 FROM notifications` | > 90% | > 90% | > 95% |
| 21 | LinkedIn acceptance rate | `COUNT(result='accepted') / COUNT(*) * 100 FROM linkedin_actions WHERE action_type='connection_sent'` | 20-40% | >= 25% | >= 35% |
| **NURTUREUR** | | | | | |
| 22 | Taux ouverture nurture | `COUNT(status IN ('OPENED','CLICKED','REPLIED')) / COUNT(*) * 100 FROM nurture_emails` | 20-30% | >= 25% | >= 30% |
| 23 | Taux clic nurture | `COUNT(status IN ('CLICKED','REPLIED')) / COUNT(*) * 100 FROM nurture_emails` | 3-5% | >= 4% | >= 6% |
| 24 | Taux reclassification HOT | `COUNT(nurture_status='RECLASSIFIED_HOT') / COUNT(*) * 100 FROM nurture_prospects` | 3-8% | >= 5% | >= 8% |
| 25 | Delai maturation moyen | `AVG(EXTRACT(days FROM updated_at - created_at)) WHERE nurture_status = 'RECLASSIFIED_HOT'` | 60-120 jours | < 90 jours | < 60 jours |
| 26 | Taux sunset | `COUNT(nurture_status='SUNSET') / COUNT(*) * 100` | 40-60% | < 60% | < 45% |
| **PIPELINE GLOBAL** | | | | | |
| 27 | Conversion end-to-end | `deals_gagnes / leads_bruts * 100` | 2-5% | >= 2% | >= 4% |
| 28 | CAC (Customer Acquisition Cost) | `couts_mensuels_total / deals_gagnes` | 800-2000 EUR | < 500 EUR | < 300 EUR |
| 29 | Pipeline velocity | `(opportunities * avg_deal * win_rate) / cycle_days` | Variable | >= 500 EUR/jour | >= 1500 EUR/jour |
| 30 | Pipeline coverage ratio | `pipeline_value / monthly_target` | 3-4x | >= 3x | >= 4x |
| 31 | Win rate | `deals_gagnes / (deals_gagnes + deals_perdus) * 100` | 8.8% (agences web) | >= 15% | >= 25% |
| 32 | Cycle de vente moyen | `AVG(cycle_vente_jours) FROM prospect_outcomes WHERE outcome = 'converti'` | 30-90 jours | < 45 jours | < 30 jours |
| 33 | Deal moyen | `AVG(montant_deal) FROM prospect_outcomes WHERE outcome = 'converti'` | 5K-15K EUR | >= 8K EUR | >= 12K EUR |
| 34 | ROI mensuel | `revenu_mensuel / couts_mensuels` | Variable | >= 10x | >= 25x |

### 4.2 Requetes SQL pour chaque KPI

```sql
-- ============================================
-- REQUETES KPI QUOTIDIENNES
-- Executees par le sous-agent 7a a 21h30
-- ============================================

-- KPI #16 : Taux de reponse quotidien
SELECT
  DATE(es.sent_at) as date,
  COUNT(DISTINCT es.prospect_id) as prospects_contactes,
  COUNT(DISTINCT rc.prospect_id) as ont_repondu,
  ROUND(
    COUNT(DISTINCT rc.prospect_id)::numeric /
    NULLIF(COUNT(DISTINCT es.prospect_id), 0) * 100, 2
  ) as reply_rate_pct
FROM email_sends es
LEFT JOIN reply_classifications rc ON rc.prospect_id = es.prospect_id
  AND rc.classified_at >= es.sent_at
WHERE DATE(es.sent_at) = CURRENT_DATE
GROUP BY DATE(es.sent_at);

-- KPI #9 : Precision HOT (mensuel)
SELECT
  COUNT(*) FILTER (WHERE outcome IN ('converti', 'opportunite')) as hot_convertis,
  COUNT(*) as hot_total,
  ROUND(
    COUNT(*) FILTER (WHERE outcome IN ('converti', 'opportunite'))::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as precision_hot_pct
FROM prospect_outcomes
WHERE categorie_at_contact = 'HOT'
  AND date_outcome >= NOW() - INTERVAL '30 days';

-- KPI #27 : Conversion end-to-end (mensuel)
WITH monthly_leads AS (
  SELECT COUNT(*) as total_leads
  FROM leads_bruts
  WHERE created_at >= NOW() - INTERVAL '30 days'
),
monthly_deals AS (
  SELECT COUNT(*) as total_deals
  FROM prospect_outcomes
  WHERE outcome = 'converti'
    AND date_outcome >= NOW() - INTERVAL '30 days'
)
SELECT
  ml.total_leads,
  md.total_deals,
  ROUND(md.total_deals::numeric / NULLIF(ml.total_leads, 0) * 100, 2) as conversion_e2e_pct
FROM monthly_leads ml, monthly_deals md;

-- KPI #28 : CAC mensuel
WITH monthly_costs AS (
  SELECT COALESCE(SUM(cout_total_jour_eur), 0) as total_costs
  FROM metriques_daily
  WHERE date_snapshot >= NOW() - INTERVAL '30 days'
),
monthly_deals AS (
  SELECT COUNT(*) as total_deals
  FROM prospect_outcomes
  WHERE outcome = 'converti'
    AND date_outcome >= NOW() - INTERVAL '30 days'
)
SELECT
  mc.total_costs,
  md.total_deals,
  ROUND(mc.total_costs / NULLIF(md.total_deals, 0), 2) as cac_eur
FROM monthly_costs mc, monthly_deals md;

-- KPI #29 : Pipeline velocity
SELECT
  COUNT(*) FILTER (WHERE outcome IN ('converti', 'opportunite', 'interesse')) as opportunities,
  COALESCE(AVG(montant_deal) FILTER (WHERE outcome = 'converti'), 0) as avg_deal,
  COALESCE(
    COUNT(*) FILTER (WHERE outcome = 'converti')::numeric /
    NULLIF(COUNT(*), 0), 0
  ) as win_rate,
  COALESCE(AVG(cycle_vente_jours) FILTER (WHERE outcome = 'converti'), 30) as avg_cycle_days,
  -- velocity = (opps * avg_deal * win_rate) / avg_cycle
  ROUND(
    (COUNT(*) FILTER (WHERE outcome IN ('converti', 'opportunite', 'interesse'))
     * COALESCE(AVG(montant_deal) FILTER (WHERE outcome = 'converti'), 0)
     * COALESCE(COUNT(*) FILTER (WHERE outcome = 'converti')::numeric / NULLIF(COUNT(*), 0), 0)
    ) / NULLIF(COALESCE(AVG(cycle_vente_jours) FILTER (WHERE outcome = 'converti'), 30), 0)
  , 2) as velocity_eur_per_day
FROM prospect_outcomes
WHERE date_outcome >= NOW() - INTERVAL '90 days';
```

---

## 5. ATTRIBUTION MULTI-TOUCH

### 5.1 Modele d'attribution pour Axiom

Axiom utilise un modele **U-Shaped (Position-Based)** en Phase 1, puis evoluera vers un modele **Time-Decay** en Phase 2 quand il y aura assez de donnees.

**U-Shaped** : 40% premier contact + 40% dernier contact + 20% reparti sur les contacts intermediaires.

**Justification** : Axiom est un pipeline outbound -- le premier contact (detection par le VEILLEUR + premier email du SUIVEUR) et le dernier contact (le message qui declenche le deal) sont les plus importants. Les contacts intermediaires (relances, nurture) comptent mais moins.

### 5.2 Table SQL : touchpoints (attribution)

```sql
CREATE TABLE IF NOT EXISTS touchpoints (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  channel VARCHAR(50) NOT NULL,
    -- 'veilleur_linkedin', 'veilleur_marches', 'veilleur_web', 'veilleur_jobboards',
    -- 'email_cold', 'email_followup', 'email_nurture',
    -- 'linkedin_connection', 'linkedin_message', 'linkedin_like', 'linkedin_comment',
    -- 'telephone', 'referral', 'inbound'
  touchpoint_type VARCHAR(100) NOT NULL,
    -- 'detection', 'enrichissement', 'scoring',
    -- 'premier_email', 'relance_1', 'relance_2', 'relance_3',
    -- 'nurture_email_1', 'nurture_email_2',
    -- 'linkedin_connection_sent', 'linkedin_message_sent',
    -- 'reply_received', 'rdv_booked', 'proposal_sent', 'deal_closed'
  agent_source VARCHAR(30) NOT NULL,
    -- 'agent_1', 'agent_2', 'agent_3', 'agent_4', 'agent_5', 'agent_6'
  template_id VARCHAR(100),
  ab_variant VARCHAR(5),                -- 'A' ou 'B'
  signal_type VARCHAR(50),              -- Type de signal (pour Agent 1)
  segment VARCHAR(30),
  scoring_categorie VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_touchpoints_prospect ON touchpoints(prospect_id, created_at);
CREATE INDEX idx_touchpoints_channel ON touchpoints(channel);
CREATE INDEX idx_touchpoints_agent ON touchpoints(agent_source);
CREATE INDEX idx_touchpoints_template ON touchpoints(template_id);

-- Table des resultats d'attribution pre-calcules
CREATE TABLE IF NOT EXISTS attribution_results (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL,
  model_name VARCHAR(30) NOT NULL,
    -- 'u_shaped', 'time_decay', 'linear', 'first_touch', 'last_touch'
  touchpoint_id INTEGER REFERENCES touchpoints(id),
  channel VARCHAR(50),
  agent_source VARCHAR(30),
  template_id VARCHAR(100),
  credit_pct NUMERIC(5,2) NOT NULL,       -- 0-100%
  revenue_attributed NUMERIC(12,2),        -- deal_value * credit_pct / 100
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_attribution_prospect ON attribution_results(prospect_id, model_name);
CREATE INDEX idx_attribution_channel ON attribution_results(channel, model_name);
CREATE INDEX idx_attribution_template ON attribution_results(template_id, model_name);
```

### 5.3 Requetes d'attribution

```sql
-- ============================================
-- ATTRIBUTION U-SHAPED (Phase 1 Axiom)
-- 40% premier touch + 40% dernier touch + 20% middle
-- ============================================

WITH deal_touches AS (
  SELECT
    tp.prospect_id,
    tp.id as touchpoint_id,
    tp.channel,
    tp.agent_source,
    tp.template_id,
    tp.created_at,
    po.montant_deal,
    ROW_NUMBER() OVER (PARTITION BY tp.prospect_id ORDER BY tp.created_at ASC) as touch_order,
    ROW_NUMBER() OVER (PARTITION BY tp.prospect_id ORDER BY tp.created_at DESC) as reverse_order,
    COUNT(*) OVER (PARTITION BY tp.prospect_id) as total_touches
  FROM touchpoints tp
  JOIN prospect_outcomes po ON po.prospect_id = tp.prospect_id
  WHERE po.outcome = 'converti'
    AND po.date_outcome >= NOW() - INTERVAL '90 days'
),
attributed AS (
  SELECT
    prospect_id,
    touchpoint_id,
    channel,
    agent_source,
    template_id,
    montant_deal,
    touch_order,
    total_touches,
    CASE
      -- Un seul touch : 100%
      WHEN total_touches = 1 THEN 100.0
      -- Deux touches : 50/50
      WHEN total_touches = 2 AND touch_order = 1 THEN 50.0
      WHEN total_touches = 2 AND touch_order = 2 THEN 50.0
      -- Premier touch : 40%
      WHEN touch_order = 1 THEN 40.0
      -- Dernier touch : 40%
      WHEN reverse_order = 1 THEN 40.0
      -- Touches intermediaires : 20% / (total - 2)
      ELSE 20.0 / (total_touches - 2)
    END as credit_pct
  FROM deal_touches
)
INSERT INTO attribution_results (prospect_id, model_name, touchpoint_id, channel, agent_source, template_id, credit_pct, revenue_attributed)
SELECT
  prospect_id,
  'u_shaped',
  touchpoint_id,
  channel,
  agent_source,
  template_id,
  ROUND(credit_pct, 2),
  ROUND(montant_deal * credit_pct / 100, 2)
FROM attributed;

-- Vue : Revenue attribue par canal
CREATE OR REPLACE VIEW v_attribution_par_canal AS
SELECT
  ar.model_name,
  ar.channel,
  COUNT(DISTINCT ar.prospect_id) as deals,
  ROUND(SUM(ar.revenue_attributed), 2) as total_revenue_attributed,
  ROUND(AVG(ar.credit_pct), 2) as credit_moyen_pct,
  ROUND(SUM(ar.revenue_attributed) / NULLIF(COUNT(DISTINCT ar.prospect_id), 0), 2) as revenue_par_deal
FROM attribution_results ar
GROUP BY ar.model_name, ar.channel
ORDER BY ar.model_name, total_revenue_attributed DESC;

-- Vue : Revenue attribue par template
CREATE OR REPLACE VIEW v_attribution_par_template AS
SELECT
  ar.model_name,
  ar.template_id,
  COUNT(DISTINCT ar.prospect_id) as deals,
  ROUND(SUM(ar.revenue_attributed), 2) as total_revenue_attributed,
  ROUND(AVG(ar.credit_pct), 2) as credit_moyen_pct
FROM attribution_results ar
WHERE ar.template_id IS NOT NULL
GROUP BY ar.model_name, ar.template_id
ORDER BY ar.model_name, total_revenue_attributed DESC;

-- Vue : Revenue attribue par agent
CREATE OR REPLACE VIEW v_attribution_par_agent AS
SELECT
  ar.model_name,
  ar.agent_source,
  COUNT(DISTINCT ar.touchpoint_id) as touchpoints_total,
  ROUND(SUM(ar.revenue_attributed), 2) as total_revenue_attributed,
  ROUND(AVG(ar.credit_pct), 2) as credit_moyen_pct
FROM attribution_results ar
GROUP BY ar.model_name, ar.agent_source
ORDER BY ar.model_name, total_revenue_attributed DESC;

-- Vue : Parcours client complet (customer journey)
CREATE OR REPLACE VIEW v_customer_journey AS
SELECT
  po.prospect_id,
  p.prenom || ' ' || p.nom as prospect_name,
  p.entreprise as entreprise,
  po.montant_deal,
  po.cycle_vente_jours,
  STRING_AGG(
    tp.channel || ':' || tp.touchpoint_type || ' [' || tp.agent_source || '] (' || tp.created_at::DATE || ')',
    ' --> '
    ORDER BY tp.created_at
  ) as journey,
  COUNT(tp.id) as total_touches
FROM prospect_outcomes po
JOIN prospects p ON p.prospect_id = po.prospect_id
LEFT JOIN touchpoints tp ON tp.prospect_id = po.prospect_id
WHERE po.outcome = 'converti'
GROUP BY po.prospect_id, p.prenom, p.nom, p.entreprise, po.montant_deal, po.cycle_vente_jours
ORDER BY po.date_outcome DESC;
```

---

## 6. A/B TESTING

### 6.1 Architecture des tests A/B

L'Agent 4 (REDACTEUR) cree les variantes (A = control, B = challenger). L'Agent 5 (SUIVEUR) les envoie avec une repartition 50/50. L'Agent 7 (ANALYSTE) mesure les resultats et recommande un gagnant.

### 6.2 Taille d'echantillon minimum

Pour une significativite statistique a 95% (confiance) et 80% (puissance) :

```
n = ((Z_alpha/2 + Z_beta)^2 * (p1*(1-p1) + p2*(1-p2))) / (p1 - p2)^2

Ou :
  Z_alpha/2 = 1.96 (confiance 95%)
  Z_beta = 0.84 (puissance 80%)
  p1 = baseline rate (control)
  p2 = expected rate (variante)
```

**Calculs pour les scenarios Axiom :**

| Scenario | Baseline (p1) | Objectif (p2) | MDE | Taille min par variante |
|---|---|---|---|---|
| Reply rate 5% -> 7% | 5% | 7% | 2pp | ~2,035 |
| Reply rate 5% -> 6% | 5% | 6% | 1pp | ~8,140 |
| Open rate 30% -> 33% | 30% | 33% | 3pp | ~3,500 |
| Reply rate 5% -> 8% | 5% | 8% | 3pp | ~900 |

**En pratique pour Axiom Phase 1 (50-100 emails/semaine) :**

| Volume Axiom | Taille min realiste | MDE detectable | Duree minimale test |
|---|---|---|---|
| 50/semaine | 250 par variante | 5pp (5% -> 10%) | 10 semaines |
| 100/semaine | 250 par variante | 5pp | 5 semaines |
| 200/semaine | 500 par variante | 3pp (5% -> 8%) | 5 semaines |

**Regle pratique Axiom** : Minimum 250 envois par variante. Un test dure au minimum 4 semaines. On ne conclut jamais avant 250 envois par variante.

### 6.3 Table SQL : ab_tests

```sql
CREATE TABLE IF NOT EXISTS ab_tests (
  id SERIAL PRIMARY KEY,
  test_id VARCHAR(100) NOT NULL UNIQUE,
  test_name VARCHAR(200) NOT NULL,
  element_teste VARCHAR(50) NOT NULL,
    -- 'subject_line', 'hook', 'cta', 'body_length', 'send_time', 'sequence_length'
  template_control_id VARCHAR(100) NOT NULL,  -- Variante A
  template_challenger_id VARCHAR(100) NOT NULL, -- Variante B
  segment_cible VARCHAR(30),                    -- NULL = tous segments
  categorie_cible VARCHAR(20),                  -- NULL = toutes categories
  statut VARCHAR(20) DEFAULT 'RUNNING'
    CHECK (statut IN ('RUNNING', 'CONCLUDED', 'PAUSED', 'CANCELLED')),
  date_debut TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date_fin TIMESTAMP WITH TIME ZONE,
  taille_min_par_variante INTEGER DEFAULT 250,
  envois_a INTEGER DEFAULT 0,
  envois_b INTEGER DEFAULT 0,
  replies_a INTEGER DEFAULT 0,
  replies_b INTEGER DEFAULT 0,
  positive_replies_a INTEGER DEFAULT 0,
  positive_replies_b INTEGER DEFAULT 0,
  reply_rate_a NUMERIC(5,2) DEFAULT 0,
  reply_rate_b NUMERIC(5,2) DEFAULT 0,
  z_score NUMERIC(5,2),
  p_value NUMERIC(5,4),
  gagnant VARCHAR(5),                           -- 'A', 'B', 'TIE'
  confiance_resultat NUMERIC(5,2),
  recommandation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_statut ON ab_tests(statut);
CREATE INDEX idx_ab_tests_date ON ab_tests(date_debut DESC);
```

> **Code de calcul de significativite et evaluation A/B** : voir AGENT-7d-RECOMMANDEUR.md

---

## 7. FORECASTING

### 7.1 Pipeline Coverage Ratio

```
Pipeline Coverage = Pipeline Value (weighted) / Monthly Revenue Target

Axiom Phase 1 :
  Target mensuel : 50,000 EUR
  Pipeline necessaire (3x coverage) : 150,000 EUR en pipeline pondere
```

```sql
-- Calcul pipeline coverage
SELECT
  (SELECT COALESCE(SUM(
    CASE
      WHEN outcome = 'opportunite' THEN montant_deal * 0.50
      WHEN outcome = 'interesse' THEN montant_deal * 0.25
      ELSE 0
    END
  ), 0)
  FROM prospect_outcomes
  WHERE outcome IN ('opportunite', 'interesse')
    AND date_outcome >= NOW() - INTERVAL '90 days'
  ) as weighted_pipeline,

  50000 as monthly_target,

  ROUND(
    (SELECT COALESCE(SUM(
      CASE
        WHEN outcome = 'opportunite' THEN montant_deal * 0.50
        WHEN outcome = 'interesse' THEN montant_deal * 0.25
        ELSE 0
      END
    ), 0)
    FROM prospect_outcomes
    WHERE outcome IN ('opportunite', 'interesse')
      AND date_outcome >= NOW() - INTERVAL '90 days'
    ) / 50000.0
  , 2) as coverage_ratio,

  CASE
    WHEN (SELECT COALESCE(SUM(
      CASE
        WHEN outcome = 'opportunite' THEN montant_deal * 0.50
        WHEN outcome = 'interesse' THEN montant_deal * 0.25
        ELSE 0
      END
    ), 0)
    FROM prospect_outcomes
    WHERE outcome IN ('opportunite', 'interesse')
      AND date_outcome >= NOW() - INTERVAL '90 days'
    ) / 50000.0 >= 4 THEN 'EXCELLENT'
    WHEN (SELECT COALESCE(SUM(
      CASE
        WHEN outcome = 'opportunite' THEN montant_deal * 0.50
        WHEN outcome = 'interesse' THEN montant_deal * 0.25
        ELSE 0
      END
    ), 0)
    FROM prospect_outcomes
    WHERE outcome IN ('opportunite', 'interesse')
      AND date_outcome >= NOW() - INTERVAL '90 days'
    ) / 50000.0 >= 3 THEN 'BON'
    WHEN (SELECT COALESCE(SUM(
      CASE
        WHEN outcome = 'opportunite' THEN montant_deal * 0.50
        WHEN outcome = 'interesse' THEN montant_deal * 0.25
        ELSE 0
      END
    ), 0)
    FROM prospect_outcomes
    WHERE outcome IN ('opportunite', 'interesse')
      AND date_outcome >= NOW() - INTERVAL '90 days'
    ) / 50000.0 >= 2 THEN 'ACCEPTABLE'
    ELSE 'INSUFFISANT'
  END as verdict;
```

### 7.2 Previsions 30/60/90 jours

**Methode 1 : Lead-Driven Forecast**

```
Revenue Forecast = Leads en pipeline * Conversion Rate * Deal moyen

Exemple :
  Leads en pipeline (actifs) : 150
  Conversion rate historique (lead -> deal) : 3%
  Deal moyen : 10,000 EUR
  Forecast 30j = 150 * 0.03 * 10,000 = 45,000 EUR
```

**Methode 2 : Weighted Pipeline**

```
30j Forecast = SUM(deal_value * stage_probability) pour close_date <= 30 jours
60j Forecast = SUM(deal_value * stage_probability) pour close_date <= 60 jours
90j Forecast = SUM(deal_value * stage_probability) pour close_date <= 90 jours
```

**Methode 3 : Moving Average**

```
Forecast mois suivant = AVG(revenue des 3 derniers mois) * (1 + growth_rate)
```

```sql
-- Prevision par moving average
WITH monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', date_outcome) as mois,
    SUM(montant_deal) as revenu
  FROM prospect_outcomes
  WHERE outcome = 'converti'
    AND date_outcome >= NOW() - INTERVAL '6 months'
  GROUP BY DATE_TRUNC('month', date_outcome)
  ORDER BY mois DESC
  LIMIT 3
)
SELECT
  ROUND(AVG(revenu), 0) as avg_3_mois,
  ROUND(AVG(revenu) * 1.10, 0) as forecast_30j_conservative,    -- +10% growth
  ROUND(AVG(revenu) * 1.15 * 2, 0) as forecast_60j_moderate,   -- +15% growth x 2 mois
  ROUND(AVG(revenu) * 1.20 * 3, 0) as forecast_90j_optimiste   -- +20% growth x 3 mois
FROM monthly_revenue;
```

### 7.3 Section du rapport mensuel : Forecasting

```
PREVISIONS PIPELINE
=======================================
                    Conservative  Moderate  Optimiste
30 jours :          45,000 EUR   55,000    65,000 EUR
60 jours :          90,000 EUR   120,000   150,000 EUR
90 jours :          135,000 EUR  200,000   250,000 EUR

Pipeline coverage : 3.2x (BON)
Velocity : 1,200 EUR/jour
Cycle moyen : 35 jours
Win rate : 18%

CONFIANCE : MOYENNE
  + Sufficient pipeline coverage
  + Velocity en hausse
  - Win rate en dessous de l'objectif (25%)
  - 3 deals en negotiation non confirmes
```

---

## 8. DASHBOARD

### 8.1 Specification Metabase

**Infrastructure** : Metabase self-hosted (Docker) connecte a PostgreSQL.

```bash
# Docker Compose pour Metabase
docker run -d \
  --name metabase \
  -p 3000:3000 \
  -e MB_DB_TYPE=postgres \
  -e MB_DB_DBNAME=axiom_pipeline \
  -e MB_DB_HOST=db.axiom.local \
  -e MB_DB_USER=analyste_readonly \
  -e MB_DB_PASS=$METABASE_DB_PASSWORD \
  -e MB_SITE_NAME="Axiom Analytics" \
  -e MB_ADMIN_EMAIL="jonathan@axiom-marketing.fr" \
  metabase/metabase:latest
```

### 8.2 Dashboard principal : Vue pipeline

**Disposition (3 lignes, 4 colonnes)** :

```
┌─────────────────────────────────────────────────────────────────┐
│ LIGNE 1 : KPIs headline (4 cartes)                              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ Leads    │ │ Reply    │ │ Deals    │ │ Revenue  │          │
│ │ aujourd' │ │ Rate     │ │ ce mois  │ │ ce mois  │          │
│ │ hui: 42  │ │ 5.2%     │ │ 3        │ │ 28,500   │          │
│ │ +8 vs h. │ │ +0.4pp   │ │ +1       │ │ +10,000  │          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                 │
│ LIGNE 2 : Graphiques (2 cartes larges)                         │
│ ┌─────────────────────────┐ ┌─────────────────────────┐       │
│ │ FUNNEL                   │ │ TREND 30 jours          │       │
│ │ Leads: 1245              │ │ [graphe ligne]          │       │
│ │ Qualifies: 312           │ │ - Reply rate            │       │
│ │ Contactes: 119           │ │ - Leads/jour            │       │
│ │ Reponses: 19             │ │ - Revenue cumule        │       │
│ │ Deals: 7                 │ │                         │       │
│ └─────────────────────────┘ └─────────────────────────┘       │
│                                                                 │
│ LIGNE 3 : Details (3 cartes)                                   │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐         │
│ │ PAR SEGMENT   │ │ PAR TEMPLATE  │ │ ALERTES       │         │
│ │ [table]       │ │ [bar chart]   │ │ ACTIVES       │         │
│ │ pme: 3 deals  │ │ TMPL_01: 6.1% │ │ 0 critiques  │         │
│ │ ecom: 2 deals │ │ TMPL_02: 7.7% │ │ 1 warning    │         │
│ │ ...           │ │ TMPL_03: 3.5% │ │ [details]    │         │
│ └───────────────┘ └───────────────┘ └───────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Requetes Metabase

```sql
-- Card 1 : Leads aujourd'hui (avec delta)
SELECT
  m1.veilleur_leads_bruts as leads_aujourdhui,
  m2.veilleur_leads_bruts as leads_hier,
  m1.veilleur_leads_bruts - m2.veilleur_leads_bruts as delta
FROM metriques_daily m1
LEFT JOIN metriques_daily m2 ON m2.date_snapshot = m1.date_snapshot - 1
WHERE m1.date_snapshot = CURRENT_DATE;

-- Card 2 : Reply rate (avec delta)
SELECT
  m1.suiveur_reply_rate as reply_rate,
  m2.suiveur_reply_rate as reply_rate_hier,
  m1.suiveur_reply_rate - m2.suiveur_reply_rate as delta_pp
FROM metriques_daily m1
LEFT JOIN metriques_daily m2 ON m2.date_snapshot = m1.date_snapshot - 1
WHERE m1.date_snapshot = CURRENT_DATE;

-- Card 5 : Funnel mensuel
SELECT
  'Leads bruts' as etape, SUM(veilleur_leads_bruts) as volume, 1 as ordre
FROM metriques_daily WHERE date_snapshot >= DATE_TRUNC('month', CURRENT_DATE)
UNION ALL
SELECT 'Leads qualifies', SUM(veilleur_leads_qualifies), 2
FROM metriques_daily WHERE date_snapshot >= DATE_TRUNC('month', CURRENT_DATE)
UNION ALL
SELECT 'Emails envoyes', SUM(suiveur_emails_envoyes), 3
FROM metriques_daily WHERE date_snapshot >= DATE_TRUNC('month', CURRENT_DATE)
UNION ALL
SELECT 'Reponses', SUM(suiveur_reponses_total), 4
FROM metriques_daily WHERE date_snapshot >= DATE_TRUNC('month', CURRENT_DATE)
UNION ALL
SELECT 'Reponses positives', SUM(suiveur_reponses_positives), 5
FROM metriques_daily WHERE date_snapshot >= DATE_TRUNC('month', CURRENT_DATE)
UNION ALL
SELECT 'Deals gagnes', SUM(pipeline_deals_gagnes), 6
FROM metriques_daily WHERE date_snapshot >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY ordre;

-- Card 6 : Trend 30 jours
SELECT
  date_snapshot,
  suiveur_reply_rate,
  veilleur_leads_bruts,
  pipeline_revenu_jour,
  SUM(pipeline_revenu_jour) OVER (ORDER BY date_snapshot) as revenu_cumule
FROM metriques_daily
WHERE date_snapshot >= CURRENT_DATE - 30
ORDER BY date_snapshot;

-- Card 7 : Performance par segment (ce mois)
SELECT
  s.segment_primaire as segment,
  COUNT(*) as scores,
  COUNT(*) FILTER (WHERE po.outcome = 'converti') as deals,
  COALESCE(SUM(po.montant_deal) FILTER (WHERE po.outcome = 'converti'), 0) as revenue
FROM scores s
LEFT JOIN prospect_outcomes po ON po.prospect_id = s.prospect_id
WHERE s.scored_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY s.segment_primaire
ORDER BY revenue DESC;
```

### 8.4 Dashboards secondaires

| Dashboard | Contenu | Audience | Frequence consultation |
|---|---|---|---|
| **Pipeline Overview** (principal) | KPIs headline, funnel, trend, segments, alertes | Jonathan | Quotidien |
| **Email Performance** | Reply rate par template, par segment, par jour, bounces | Jonathan + technique | Hebdomadaire |
| **Scoring Health** | Distribution scores, precision, faux positifs, calibration | Technique | Mensuel |
| **Nurture Dashboard** | Entonnoir nurture, engagement, reclassifications, contenu | Jonathan | Hebdomadaire |
| **Attribution & ROI** | Revenue par canal, par template, parcours client, CAC | Jonathan | Mensuel |
| **Alertes & Anomalies** | Historique alertes, anomalies detectees, resolutions | Technique | Continu |
| **Couts & Budget** | Couts par agent, par API, tendances, previsions | Jonathan | Mensuel |

---

## 9. COUTS

### 9.1 Couts de l'Agent 7

| Poste | Cout mensuel | Details |
|---|---|---|
| **Claude API** (rapports + recommandations) | ~30 EUR | ~50 appels/mois |
| **Slack API** | 0 EUR | Free plan suffisant |
| **Gmail API** (envoi rapports email) | 0 EUR | Gratuit |
| **Metabase** (self-hosted) | ~10 EUR | Part du serveur Docker |
| **Infrastructure** (cron workers, Redis part) | ~10 EUR | Part du VPS |
| **PostgreSQL** (tables analyste) | 0 EUR | Inclus dans l'infra existante |
| **TOTAL Agent 7** | **~50 EUR/mois** | |

### 9.2 Detail Claude API Agent 7

```
Modele : claude-sonnet-4-20250514
Tarif : $3.00 / million tokens input, $15.00 / million tokens output

Par rapport hebdomadaire :
- System prompt : ~500 tokens input
- User message (donnees + instructions) : ~2,000 tokens input
- Output (rapport structure) : ~1,500 tokens
- Cout : (2500 / 1M) * $3.00 + (1500 / 1M) * $15.00 = $0.0075 + $0.0225 = $0.03
- 4 rapports hebdo/mois = $0.12 ~ 0.11 EUR

Par rapport mensuel :
- System prompt : ~500 tokens input
- User message : ~4,000 tokens input
- Output : ~3,000 tokens
- Cout : (4500 / 1M) * $3.00 + (3000 / 1M) * $15.00 = $0.0135 + $0.045 = $0.06
- 1 rapport mensuel = $0.06 ~ 0.055 EUR

Par resume recommandation :
- Input : ~1,500 tokens
- Output : ~800 tokens
- Cout : ~$0.017
- 4 par mois = $0.068 ~ 0.063 EUR

Digest quotidien : 0 EUR (pas de Claude API, texte structure genere par code)

Total Claude API : ~0.23 EUR/mois pour les rapports standard
  + marge pour re-generations, tests, analyses ad-hoc : ~30 EUR/mois budget
```

### 9.3 Cout total du systeme complet (10 agents)

| Agent | Cout mensuel | % du total |
|---|---|---|
| **Agent 1 -- VEILLEUR** | ~430 EUR | 46% |
| **Agent 2 -- ENRICHISSEUR** | ~180 EUR | 19% |
| **Agent 3 -- SCOREUR** | 0 EUR | 0% |
| **Agent 4 -- REDACTEUR** | ~25 EUR | 3% |
| **Agent 5 -- SUIVEUR** | ~150 EUR | 16% |
| **Agent 6 -- NURTUREUR** | ~37 EUR | 4% |
| **Agent 7 -- ANALYSTE** | ~50 EUR | 5% |
| **Infrastructure partagee** (VPS 4-core, PostgreSQL, Redis) | ~60 EUR | 6% |
| **TOTAL SYSTEME** | **~1 175 EUR/mois** | 100% |

### 9.4 Cout annuel total

| Poste | Cout annuel |
|---|---|
| APIs et services (tous agents) | ~9,100 EUR |
| Infrastructure (VPS, domaines, warmup) | ~2,100 EUR |
| **Total annuel** | **~11,200 EUR** |

### 9.5 ROI du systeme

```
SCENARIO PHASE 1 (mois 3-6 apres lancement) :
  Deals/mois : 5-10
  Deal moyen : 8,000 EUR
  Revenue mensuel : 40,000 - 80,000 EUR
  Couts pipeline : 932 EUR/mois
  ROI : 43x - 86x
  CAC : 93 - 186 EUR/deal

SCENARIO PHASE 2 (mois 6-12) :
  Deals/mois : 10-20
  Deal moyen : 12,000 EUR
  Revenue mensuel : 120,000 - 240,000 EUR
  Couts pipeline : ~1,200 EUR/mois (scaling)
  ROI : 100x - 200x
  CAC : 60 - 120 EUR/deal
```

---

## 10. VERIFICATION DE COHERENCE GLOBALE

### 10.1 Chaine des inputs/outputs entre agents

```
Agent 1 (VEILLEUR)
  Output : leads_bruts (table SQL) + schema JSON normalise
    |
    v
Agent 2 (ENRICHISSEUR)
  Input : leads_bruts via queue BullMQ 'enrichisseur-pipeline'
  Output : prospects enrichis (table prospects) via queue 'scoreur-pipeline'
    |
    v
Agent 3 (SCOREUR)
  Input : fiche prospect enrichie via queue BullMQ 'scoreur-pipeline'
  Output : fiche prospect + score + routing via queue 'redacteur-pipeline'
    |
    v
Agent 4 (REDACTEUR)
  Input : fiche scoree via queue BullMQ 'redacteur-pipeline'
  Output : message pret a envoyer via queue 'suiveur-pipeline'
    |
    v
Agent 5 (SUIVEUR)
  Input : message pret via queue BullMQ 'suiveur-pipeline'
  Output A : interactions loggees (email_sends, reply_classifications, etc.)
  Output B : NurturerHandoff via queue 'nurturer-pipeline' (si fin sequence sans conversion)
  Output C : AnalysteMetrics (metriques pour Agent 7)
    |
    +---> Agent 6 (NURTUREUR)
    |       Input : NurturerHandoff via queue BullMQ 'nurturer-pipeline'
    |       Output A : ScoreurResubmission via queue 'scoreur-pipeline' (si reclassification HOT)
    |       Output B : NurtureAnalysteMetrics (metriques pour Agent 7)
    |       Output C : nurture_prospects, nurture_interactions, nurture_emails (tables SQL)
    |
    +---> Agent 7 (ANALYSTE)
            Input : TOUTES les tables SQL de tous les agents (lecture seule)
            Output : metriques_daily, alertes, recommandations, rapports (Slack + email)
```

**Verification** :

| Liaison | Input/Output | Statut |
|---|---|---|
| Agent 1 -> Agent 2 | leads_bruts -> enrichisseur-pipeline | VALIDE (verifie dans specs Agent 1, section 9.1) |
| Agent 2 -> Agent 3 | prospect enrichi -> scoreur-pipeline | VALIDE (verifie dans specs Agent 3, section 2) |
| Agent 3 -> Agent 4 | fiche scoree -> redacteur-pipeline | VALIDE (verifie dans specs Agent 3, section 10) |
| Agent 4 -> Agent 5 | message pret -> suiveur-pipeline | VALIDE (verifie dans specs Agent 5, section 2) |
| Agent 5 -> Agent 6 | NurturerHandoff -> nurturer-pipeline | VALIDE (verifie dans specs Agent 6, section 2) |
| Agent 6 -> Agent 3 | ScoreurResubmission -> scoreur-pipeline | VALIDE (verifie dans specs Agent 6, section 10) |
| Tous -> Agent 7 | Tables SQL (lecture seule) | VALIDE (ce document, section 2) |

**RESULTAT : 100% de coherence dans la chaine des inputs/outputs.**

### 10.2 Schema de BDD global -- Toutes les tables

```sql
-- ============================================
-- RECAPITULATIF COMPLET DU SCHEMA BDD
-- Toutes les tables de tous les 10 agents
-- PostgreSQL 16
-- ============================================

-- === AGENT 1 : VEILLEUR ===
-- leads_bruts                  -- Leads detectes (output veilleur, input enrichisseur)
-- signaux_linkedin             -- Signaux LinkedIn detectes
-- marches_publics              -- Marches publics detectes
-- audits_techniques            -- Resultats scan web/tech
-- offres_emploi                -- Offres d'emploi detectees
-- deduplication_log            -- Log de deduplication
-- headcount_snapshots          -- Snapshots croissance equipe
-- sites_a_scanner              -- Input pour le veilleur web
-- veilleur_batches             -- Suivi des batchs master
-- api_usage                    -- Tracking couts API

-- === AGENT 2 : ENRICHISSEUR ===
-- prospects                    -- Table principale des prospects enrichis
-- enrichment_log               -- Log d'enrichissement par prospect
-- email_verifications          -- Resultats verification emails

-- === AGENT 3 : SCOREUR ===
-- scores                       -- Scores calcules (output scoreur)
-- score_history                -- Historique des changements de score
-- prospect_outcomes            -- Resultats reels (feedback loop)
-- blocklists                   -- Listes noires (concurrents, opt-out, etc.)

-- === AGENT 4 : REDACTEUR ===
-- templates                    -- Templates de messages
-- messages_generes             -- Messages generes par le redacteur
-- ab_tests (shared with Agent 7)  -- Tests A/B en cours

-- === AGENT 5 : SUIVEUR ===
-- email_sends                  -- Emails envoyes avec tracking
-- linkedin_actions             -- Actions LinkedIn (connexions, messages)
-- reply_classifications        -- Reponses classifiees par IA
-- prospect_sequences           -- Statut des sequences par prospect
-- notifications                -- Notifications Slack envoyees a Jonathan
-- bounce_events                -- Evenements de bounce
-- linkedin_restrictions        -- Restrictions LinkedIn (rate limits)
-- idempotency_keys             -- Prevention double envoi
-- rgpd_events                  -- Evenements RGPD (opt-out, suppression)
-- referral_leads               -- Leads issus de referrals detectes
-- system_config                -- Configuration systeme (domaines, horaires)

-- === AGENT 6 : NURTUREUR ===
-- nurture_prospects            -- Prospects en nurturing
-- nurture_interactions         -- Interactions nurture (emails, likes, comments)
-- nurture_emails               -- Emails nurture envoyes avec tracking
-- rgpd_deletion_queue          -- Queue suppression RGPD

-- === AGENT 7 : ANALYSTE ===
-- metriques_daily              -- Snapshots metriques quotidiens (60+ champs)
-- alertes                      -- Alertes detectees (anomalies)
-- recommandations              -- Recommandations pour les autres agents
-- ab_tests                     -- Suivi des tests A/B (partage avec Agent 4)
-- touchpoints                  -- Tous les points de contact (attribution)
-- attribution_results          -- Resultats d'attribution pre-calcules

-- === VUES (pas de tables physiques) ===
-- v_veilleur_daily_summary     -- Agent 1
-- v_marches_actifs             -- Agent 1
-- score_distribution           -- Agent 3
-- v_metrics_envoi_daily        -- Agent 5
-- v_metrics_reponses           -- Agent 5
-- v_conversion_par_segment     -- Agent 5
-- v_sla_compliance             -- Agent 5
-- v_nurture_dashboard_monthly  -- Agent 6
-- v_nurture_content_performance -- Agent 6
-- v_nurture_funnel             -- Agent 6
-- v_nurture_engagement_weekly  -- Agent 6
-- v_nurture_metrics_daily      -- Agent 6
-- v_nurture_conversion_par_segment -- Agent 6
-- v_nurture_content_perf       -- Agent 6
-- v_nurture_sante              -- Agent 6
-- v_attribution_par_canal      -- Agent 7
-- v_attribution_par_template   -- Agent 7
-- v_attribution_par_agent      -- Agent 7
-- v_customer_journey           -- Agent 7
```

**Verification : aucun champ manquant.** Chaque table referencee dans les requetes de l'Agent 7 (section 3) existe dans les specs de l'agent correspondant.

### 10.3 Volumes realistes bout en bout

```
FLUX QUOTIDIEN MOYEN (Phase 1)
=======================================

Agent 1 (VEILLEUR) :
  Input : 4 sources (LinkedIn, Marches, Web, Job Boards)
  Output : 30-80 leads bruts/jour
  Apres dedup : 25-65 leads/jour
  Qualifies (pre_score >= 60) : 8-20/jour

Agent 2 (ENRICHISSEUR) :
  Input : 8-20 leads/jour
  Temps : 3-10s par lead
  Output : 8-20 prospects enrichis/jour (95%+ taux enrichissement)

Agent 3 (SCOREUR) :
  Input : 8-20 prospects/jour
  Temps : < 50ms par prospect
  Output : ~1-2 HOT, 3-6 WARM, 4-8 COLD, 2-4 DISQ / jour

Agent 4 (REDACTEUR) :
  Input : 4-8 prospects a contacter/jour (HOT + WARM)
  Temps : 2-5s par message (Claude API)
  Output : 4-8 messages prets/jour

Agent 5 (SUIVEUR) :
  Input : 4-8 messages/jour (nouveaux) + relances
  Output : 10-20 emails/jour + 5-10 actions LinkedIn/jour
  Reponses : 0.5-1 reponse positive/jour

Agent 6 (NURTUREUR) :
  Input : 2-5 handoffs/semaine (fin de sequence)
  Stock : 100-300 prospects en nurture
  Output : 5-15 emails nurture/jour + 3-5 LinkedIn likes/jour
  Reclassifications : 1-3/mois

Agent 7 (ANALYSTE) :
  Input : toutes les tables SQL (lecture seule)
  Output : 1 digest/jour + 1 rapport/semaine + 1 rapport/mois
  Alertes : 0-2 par semaine en moyenne
  Recommandations : 3-5 par semaine
```

**Verification de coherence des volumes** :

| Etape | Volume | Verification |
|---|---|---|
| Leads bruts / jour | 30-80 | REALISTE -- capacite des APIs confirmee (specs Agent 1) |
| Leads qualifies / jour | 8-20 | COHERENT -- ~25% des leads bruts passent pre-score >= 60 |
| Prospects enrichis / jour | 8-20 | COHERENT -- Agent 2 traite 100% des qualifies |
| HOT / jour | 1-2 | COHERENT -- ~10% des scores |
| Emails envoyes / jour | 10-20 | COHERENT -- dans les limites de warmup (50/jour max Phase 1) |
| Reponses positives / jour | 0.5-1 | COHERENT -- reply rate 5% sur 10-20 emails |
| Deals / mois | 5-10 | COHERENT -- win rate 15-25% sur ~40 prospects contactes/mois |

**RESULTAT : Les volumes sont realistes et coherents de bout en bout.**

### 10.4 Couts totaux du systeme

| Agent | APIs/Services | Infrastructure | Claude API | Total |
|---|---|---|---|---|
| Agent 1 (VEILLEUR) | 390 EUR | 40 EUR | 0 EUR | 430 EUR |
| Agent 2 (ENRICHISSEUR) | 170 EUR | 10 EUR | 0 EUR | 180 EUR |
| Agent 3 (SCOREUR) | 0 EUR | 0 EUR (partage) | 0 EUR | 0 EUR |
| Agent 4 (REDACTEUR) | 0 EUR | 0 EUR (partage) | 25 EUR | 25 EUR |
| Agent 5 (SUIVEUR) | 110 EUR | 20 EUR | 5 EUR | 150 EUR |
| Agent 6 (NURTUREUR) | 20 EUR | 5 EUR | 12 EUR | 37 EUR |
| Agent 7 (ANALYSTE) | 0 EUR | 20 EUR | 30 EUR | 50 EUR |
| Infrastructure partagee | - | 60 EUR | - | 60 EUR |
| **TOTAL** | **690 EUR** | **155 EUR** | **72 EUR** | **932 EUR** |

*Agent 5 inclut Waalaxy (19 EUR), Mailreach warmup (60-75 EUR), domaines, etc.

**Cout par deal (si 7 deals/mois) : 133 EUR**
**Cout par deal (si 15 deals/mois) : 62 EUR**

### 10.5 ROI global attendu

```
SCENARIO CONSERVATEUR (Phase 1, mois 3-6) :
  Revenue : 5 deals x 8,000 EUR = 40,000 EUR/mois
  Couts : 932 EUR/mois
  ROI : 43x
  Marge : 39,068 EUR/mois

SCENARIO MODERATE (Phase 1-2, mois 6-12) :
  Revenue : 10 deals x 10,000 EUR = 100,000 EUR/mois
  Couts : 1,100 EUR/mois (scaling)
  ROI : 91x
  Marge : 98,900 EUR/mois

SCENARIO OPTIMISTE (Phase 2, mois 12+) :
  Revenue : 20 deals x 12,000 EUR = 240,000 EUR/mois
  Couts : 1,500 EUR/mois (scaling)
  ROI : 160x
  Marge : 238,500 EUR/mois
```

### 10.6 Risques et points d'attention

| Risque | Probabilite | Impact | Mitigation |
|---|---|---|---|
| **LinkedIn rate limiting/ban** | MOYENNE | HAUTE | Pas de scraping direct, utilisation APIs tierces (Netrows, SignalsAPI), respect des limites Waalaxy |
| **Delivrabilite email degradee** | MOYENNE | HAUTE | Plan de warmup (Agent 5 section 9), rotation domaines, monitoring bounce rate, alertes Agent 7 |
| **Precision scoring faible au debut** | HAUTE | MOYENNE | Feedback loop Agent 3 (section 8), recalibration mensuelle, validation humaine HOT-A/B |
| **Volume de leads insuffisant** | BASSE | MOYENNE | 4 sources diversifiees, possibilite d'ajouter des sources (6sense, Clearbit, etc.) |
| **RGPD non-conformite** | BASSE | TRES HAUTE | Opt-out systematique (Agent 5), droit a l'oubli (Agent 6), retention limitee, consentement tracke |
| **Cout API depasse** | BASSE | BASSE | Budget monitoring (Agent 7), alertes a 80%, fallback sur sources gratuites |
| **Faux negatifs (deals rates)** | MOYENNE | MOYENNE | Recall monitoring (Agent 7), calibration scoring, traitement WARM avec sequences adaptees |
| **Fatigue prospect (trop de contacts)** | MOYENNE | MOYENNE | Sequences adaptees par segment, distinction SUIVEUR/NURTUREUR, opt-out monitoring |
| **Dependance a une seule API** | MOYENNE | MOYENNE | Architecture multi-provider (Agent 2), fallback chains documentees |
| **Temps de mise en place** | HAUTE | BASSE | Implementation incrementale agent par agent, Phase 1 = MVP viable |

### 10.7 Checklist finale du systeme complet

| Point de verification | Statut |
|---|---|
| **Architecture** | |
| Pipeline lineaire 1->2->3->4->5 + boucle 6->3 + monitoring 7 | VALIDE |
| Queues BullMQ entre chaque agent (decouplage) | VALIDE |
| PostgreSQL 16 comme source de verite unique | VALIDE |
| Redis pour les queues et le cache | VALIDE |
| **Inputs / Outputs** | |
| Tous les inputs = outputs de l'agent precedent (100% coherence) | VALIDE |
| Schemas JSON documentes et valides (Zod) pour chaque agent | VALIDE |
| Tables SQL avec index pour chaque agent | VALIDE |
| **Fonctionnel** | |
| 4 sources de leads diversifiees (Agent 1) | VALIDE |
| Enrichissement multi-API avec fallback (Agent 2) | VALIDE |
| Scoring deterministe 4 axes avec decay temporel (Agent 3) | VALIDE |
| Templates personnalises par segment et categorie (Agent 4) | VALIDE |
| Execution multicanale email + LinkedIn (Agent 5) | VALIDE |
| Nurturing long terme avec re-scoring (Agent 6) | VALIDE |
| Mesure, alertes et recommandations automatisees (Agent 7) | VALIDE |
| **Conformite** | |
| RGPD : opt-out, droit a l'oubli, retention limitee | VALIDE |
| Pas de scraping direct LinkedIn (APIs tierces uniquement) | VALIDE |
| Validation humaine pour les actions critiques (HOT-A/B) | VALIDE |
| **Couts** | |
| Budget mensuel total : ~1 175 EUR | VALIDE |
| Budget annuel total : ~11,200 EUR | VALIDE |
| ROI minimum attendu : 43x | VALIDE |
| CAC maximum : 186 EUR/deal | VALIDE |
| **Monitoring** | |
| 34 KPIs definis avec benchmarks et objectifs | VALIDE |
| Alertes automatiques (WARNING + CRITICAL) | VALIDE |
| Rapports quotidien + hebdomadaire + mensuel | VALIDE |
| Dashboard Metabase avec 7 vues | VALIDE |
| Feedback loop vers chaque agent | VALIDE |
| A/B testing avec significativite statistique | VALIDE |
| Attribution multi-touch (U-Shaped) | VALIDE |
| Forecasting 30/60/90 jours | VALIDE |

---

## 11. INTEGRATION AVEC LES AGENTS 8, 9, 10

> **Ajout v1.1 -- 19 mars 2026** : Cette section documente l'integration de l'Analyste avec les trois nouveaux agents du pipeline etendu (Agent 8 Dealmaker, Agent 9 Appels d'offres, Agent 10 CSM).

### 11.1 Synthese de l'impact

| Agent | Impact sur Agent 7 | Nature |
|-------|-------------------|--------|
| **Agent 8 (Dealmaker)** | SIGNIFICATIF | Nouvelles tables SQL a interroger, nouveaux KPIs a tracker (win rate, cycle de vente, valeur deals, pipeline coverage), nouveaux rapports, feedback loop enrichi. |
| **Agent 9 (Appels d'offres)** | SIGNIFICATIF | Nouvelles tables SQL (AO detectes, reponses, resultats), nouveaux KPIs (taux de succes AO, valeur marches gagnes, delai moyen reponse), rapport marches publics dedie. |
| **Agent 10 (CSM)** | SIGNIFICATIF | Nouvelles tables SQL (clients actifs, NPS, churn, referrals, upsell), nouveaux KPIs (NPS moyen, retention, churn rate, referral conversion, CLV), rapport CSM dedie. |

**L'Agent 7 est le PLUS impacte** par l'ajout des 3 nouveaux agents car il doit collecter, analyser et rapporter les metriques de l'ensemble du pipeline etendu (10 agents au lieu de 7).

### 11.2 Nouvelles sources de donnees (section 2.2 etendue)

#### Agent 8 -- DEALMAKER

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `deals` | deal_id, prospect_id, stage, valeur, date_creation, date_close, loss_reason | Win rate, deal moyen, cycle de vente moyen, pipeline value, velocity |
| `deal_stages_history` | deal_id, stage_from, stage_to, timestamp | Duree par stage, taux de conversion inter-stages, goulots d'etranglement |
| `deal_activities` | deal_id, type (email, appel, rdv, proposition), date | Activites par deal, correlation activites/conversion |
| `propositions_commerciales` | deal_id, montant, statut (envoyee, acceptee, refusee) | Taux d'acceptation propositions, montant moyen |

#### Agent 9 -- APPELS D'OFFRES

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `appels_offres` | ao_id, titre, montant_estime, date_limite, statut, score_pertinence | AO detectes/mois, valeur totale, distribution par secteur |
| `ao_responses` | ao_id, statut (GO/NO-GO/SOUMIS/GAGNE/PERDU), date_soumission | Taux GO, taux de soumission, delai moyen preparation |
| `ao_scores` | ao_id, score_go_nogo, criteres_decisifs | Precision du scoring GO/NO-GO vs resultats reels |
| `memoires_techniques` | ao_id, version, score_qualite, date_generation | Volume memoires, temps de generation, qualite |

#### Agent 10 -- CSM

| Table SQL | Donnees collectees | Metriques derivees |
|---|---|---|
| `clients` | client_id, date_debut, statut (actif/churne/pause), mrr, segment | Clients actifs, MRR total, MRR par segment |
| `client_health_scores` | client_id, health_score, date_calcul | Health score moyen, distribution, evolution |
| `nps_surveys` | client_id, score, date, commentaire | NPS moyen, distribution promoteurs/passifs/detracteurs |
| `client_reviews` | client_id, rating, temoignage, published | Avis collectes, note moyenne, taux de publication |
| `referrals` | referral_id, client_source_id, prospect_referred_id, statut, date_conversion | Referrals generes/mois, taux de conversion referral, valeur referral |
| `churn_events` | client_id, churn_date, reason, revenue_lost | Churn rate, MRR perdu, raisons de churn |
| `upsell_opportunities` | client_id, opportunity_type, statut, valeur | Upsell pipeline, taux de conversion upsell |

### 11.3 Nouveaux KPIs a tracker

#### 11.3.1 KPIs Agent 8 (Dealmaker)

| KPI | Formule | Objectif | Frequence |
|-----|---------|----------|-----------|
| **Win rate** | Deals gagnes / Total deals termines | > 25% | Hebdo |
| **Deal moyen** | SUM(valeur deals gagnes) / COUNT(deals gagnes) | > 3 000 EUR | Mensuel |
| **Cycle de vente moyen** | AVG(date_close - date_creation) en jours | < 45 jours | Mensuel |
| **Pipeline value** | SUM(valeur) des deals en cours (stages 1-5) | > 3x objectif mensuel | Quotidien |
| **Pipeline coverage ratio** | Pipeline value / Objectif mensuel | > 3.0x | Hebdo |
| **Pipeline velocity** | (Nb deals x Win rate x Deal moyen) / Cycle moyen | En croissance | Mensuel |
| **Taux conversion par stage** | Deals passant au stage N+1 / Deals entrant au stage N | Pas de chute > 50% | Hebdo |
| **Raisons de perte** | Distribution des loss_reason | Identifier le motif #1 | Mensuel |

#### 11.3.2 KPIs Agent 9 (Appels d'offres)

| KPI | Formule | Objectif | Frequence |
|-----|---------|----------|-----------|
| **Taux de succes AO** | AO gagnes / AO soumis | > 20% | Mensuel |
| **Taux GO/NO-GO** | AO scores GO / Total AO detectes | 30-50% (selectivite) | Mensuel |
| **Valeur marches gagnes** | SUM(montant) des AO gagnes | En croissance | Mensuel |
| **Delai moyen preparation** | AVG(date_soumission - date_detection) en jours | < 70% du delai disponible | Mensuel |
| **Precision scoring GO/NO-GO** | AO soumis avec score GO qui ont ete gagnes vs perdus | Correlation positive | Trimestriel |
| **ROI marches publics** | (Valeur marches gagnes - Cout Agent 9) / Cout Agent 9 | > 5x | Trimestriel |

#### 11.3.3 KPIs Agent 10 (CSM)

| KPI | Formule | Objectif | Frequence |
|-----|---------|----------|-----------|
| **NPS moyen** | AVG(nps_score) sur les 90 derniers jours | > 40 | Mensuel |
| **Retention rate** | Clients actifs fin de mois / Clients actifs debut de mois | > 95% | Mensuel |
| **Churn rate** | Clients churnes / Total clients actifs | < 5% | Mensuel |
| **MRR total** | SUM(mrr) des clients actifs | En croissance | Quotidien |
| **MRR perdu (churn)** | SUM(mrr) des clients churnes dans le mois | Minimiser | Mensuel |
| **Referral conversion rate** | Referrals convertis / Referrals generes | > 30% | Mensuel |
| **Referrals/client** | Total referrals generes / Total clients ambassadeurs | > 0.5/trimestre | Trimestriel |
| **CLV (Customer Lifetime Value)** | MRR moyen x Duree moyenne contrat en mois | En croissance | Trimestriel |
| **Health score moyen** | AVG(health_score) de tous les clients actifs | > 70/100 | Hebdo |
| **Taux de reponse NPS** | Enquetes completees / Enquetes envoyees | > 40% | Mensuel |

### 11.4 Nouvelles colonnes dans metriques_daily

```sql
-- ═══ NOUVELLES COLONNES (v1.1) ═══

-- === Agent 8 : DEALMAKER ===
dealmaker_deals_crees INTEGER DEFAULT 0,
dealmaker_deals_gagnes INTEGER DEFAULT 0,
dealmaker_deals_perdus INTEGER DEFAULT 0,
dealmaker_deals_en_cours INTEGER DEFAULT 0,
dealmaker_win_rate NUMERIC(5,2) DEFAULT 0,
dealmaker_deal_moyen_eur NUMERIC(12,2) DEFAULT 0,
dealmaker_cycle_vente_moyen_jours NUMERIC(8,2) DEFAULT 0,
dealmaker_pipeline_value_eur NUMERIC(12,2) DEFAULT 0,
dealmaker_pipeline_coverage NUMERIC(5,2) DEFAULT 0,
dealmaker_propositions_envoyees INTEGER DEFAULT 0,
dealmaker_propositions_acceptees INTEGER DEFAULT 0,

-- === Agent 9 : APPELS D'OFFRES ===
ao_detectes INTEGER DEFAULT 0,
ao_scores_go INTEGER DEFAULT 0,
ao_soumis INTEGER DEFAULT 0,
ao_gagnes INTEGER DEFAULT 0,
ao_perdus INTEGER DEFAULT 0,
ao_taux_succes NUMERIC(5,2) DEFAULT 0,
ao_valeur_gagnes_eur NUMERIC(12,2) DEFAULT 0,
ao_delai_moyen_preparation_jours NUMERIC(8,2) DEFAULT 0,

-- === Agent 10 : CSM ===
csm_clients_actifs INTEGER DEFAULT 0,
csm_mrr_total_eur NUMERIC(12,2) DEFAULT 0,
csm_nps_moyen NUMERIC(5,2) DEFAULT 0,
csm_nps_promoteurs INTEGER DEFAULT 0,
csm_nps_passifs INTEGER DEFAULT 0,
csm_nps_detracteurs INTEGER DEFAULT 0,
csm_health_score_moyen NUMERIC(5,2) DEFAULT 0,
csm_churn_count INTEGER DEFAULT 0,
csm_churn_mrr_perdu_eur NUMERIC(12,2) DEFAULT 0,
csm_referrals_generes INTEGER DEFAULT 0,
csm_referrals_convertis INTEGER DEFAULT 0,
csm_upsell_pipeline_eur NUMERIC(12,2) DEFAULT 0,
csm_avis_collectes INTEGER DEFAULT 0,
```

### 11.5 Nouveaux rapports a generer

#### 11.5.1 Digest quotidien (etendu)

Le digest quotidien Slack (22h00) inclut desormais 3 sections supplementaires :

```
=== AGENT 8 -- DEALMAKER ===
Deals actifs : X | Pipeline : XX XXX EUR
Deals gagnes aujourd'hui : X (XX XXX EUR)
Deals perdus aujourd'hui : X (raison #1 : prix)
Win rate (30j glissant) : XX%

=== AGENT 9 -- APPELS D'OFFRES ===
AO detectes cette semaine : X
AO en cours de redaction : X
AO soumis ce mois : X | Gagnes : X | Perdus : X
Taux de succes (12 mois glissant) : XX%

=== AGENT 10 -- CSM ===
Clients actifs : XX | MRR : XX XXX EUR
NPS moyen : XX (P: XX% | N: XX% | D: XX%)
Health score moyen : XX/100
Churns ce mois : X (MRR perdu : X XXX EUR)
Referrals generes : X | Convertis : X
```

#### 11.5.2 Rapport hebdomadaire etendu (lundi 09:00)

Nouveaux blocs dans le rapport hebdomadaire :

| Bloc | Contenu |
|------|---------|
| **Pipeline Deals (Agent 8)** | Deals par stage, velocity, win rate, top deals en cours, deals a risque, raisons de perte |
| **Marches Publics (Agent 9)** | AO detectes vs soumis, resultats, pipeline AO, delais de preparation |
| **Satisfaction Client (Agent 10)** | NPS trend, health score distribution, alertes churn, referrals, upsell |

#### 11.5.3 Rapport mensuel strategique etendu (1er du mois)

Nouveaux KPIs strategiques dans le rapport mensuel :

| Section | KPIs |
|---------|------|
| **Revenue** | MRR, ARR, croissance MRR, MRR expansion (upsell), MRR contraction (churn) |
| **Sales efficiency** | Win rate, cycle de vente, CAC (cout acquisition), CAC payback period |
| **Client success** | NPS trend 12 mois, retention, CLV, health score trend |
| **Marches publics** | Taux de succes, valeur gagnee, ROI Agent 9 |
| **Referral engine** | Referrals/mois, conversion rate, valeur referral pipeline, % du pipeline total |

### 11.6 Feedback loop vers Agents 8, 9, 10

L'Analyste genere des recommandations pour chacun des 3 nouveaux agents :

| Agent cible | Type de recommandation | Exemple |
|------------|----------------------|---------|
| **Agent 8** | Optimisation pipeline | "Le stage 4 (Proposition) a un taux de conversion de 35%, inferieur au benchmark 50%. Recommandation : revoir le template de proposition commerciale, ajouter une etude de cas." |
| **Agent 8** | Alertes deals a risque | "3 deals n'ont pas eu d'activite depuis 14 jours. Relancer avec une offre limitee dans le temps." |
| **Agent 8** | Analyse raisons de perte | "60% des deals perdus ce mois citent le 'prix' comme raison. Recommandation : revoir le positionnement tarif pour le segment PME." |
| **Agent 9** | Precision scoring GO/NO-GO | "Le scoring GO/NO-GO a une precision de 65%. Les AO avec un score > 80 ont un taux de succes de 40% vs 10% pour les scores < 60. Le scoring est discriminant." |
| **Agent 9** | Optimisation delai preparation | "Le delai moyen de preparation est de 15 jours, soit 75% du delai disponible. Recommandation : commencer la preparation des que le score GO est > 70, sans attendre la validation." |
| **Agent 10** | Alertes churn | "5 clients ont un health score < 40. Declenchement automatique de l'alerte Agent 10c." |
| **Agent 10** | Optimisation NPS | "Le NPS a baisse de 45 a 38 ce mois. Les detracteurs citent principalement 'temps de reponse' et 'reporting'. Recommandation : ameliorer les SLA de reponse support." |
| **Agent 10** | Strategie referral | "Les clients du segment e-commerce generent 3x plus de referrals que les PME classiques. Recommandation : concentrer les demandes de referral sur ce segment." |

### 11.7 Nouvelles vues SQL exploitees

```
-- Agent 8 (DEALMAKER)
v_deal_pipeline_summary           -- Pipeline par stage et valeur
v_deal_win_rate_monthly           -- Win rate mensuel
v_deal_velocity                   -- Pipeline velocity

-- Agent 9 (APPELS D'OFFRES)
v_ao_monthly_summary              -- Resume mensuel AO
v_ao_success_rate                 -- Taux de succes par segment/montant

-- Agent 10 (CSM)
v_client_health_dashboard         -- Dashboard sante clients
v_nps_trend                       -- Tendance NPS
v_referral_funnel                 -- Entonnoir referrals
v_churn_analysis                  -- Analyse churn par raison/segment
v_mrr_waterfall                   -- Waterfall MRR (new, expansion, churn, contraction)
```

### 11.8 Ce qui NE change PAS

| Composant | Changement |
|-----------|-----------|
| Sous-agents existants (7a Collecteur, 7b Generateur, 7c Detecteur, 7d Recommandeur) | AUCUN -- ils sont etendus mais pas modifies structurellement |
| Metriques Agents 1-6 (colonnes existantes dans `metriques_daily`) | AUCUN |
| Z-score et detection d'anomalies | AUCUN -- meme logique, appliquee a plus de KPIs |
| Attribution multi-touch (U-Shaped) | AUCUN -- le modele reste identique |
| A/B testing (analyse, significativite) | AUCUN |
| Forecasting 30/60/90 jours | ETENDU -- inclut desormais le pipeline deals et AO |
| Dashboard Metabase | ETENDU -- 3 nouvelles pages (Deals, AO, CSM) |
| Feedback loop vers Agents 1-6 | AUCUN |
| Cout de base (~50 EUR/mois) | IMPACT MODERE -- requetes SQL supplementaires, Claude API pour analyse (+10-15 EUR/mois) |

---

## ANNEXE A : SCHEDULER PRINCIPAL AGENT 7

```typescript
// scheduler-agent7.ts (AdonisJS ou node-cron)

import cron from 'node-cron'
import { collectDailySnapshot } from './sous-agents/7a-collecteur'
import { detectAnomalies } from './sous-agents/7c-detecteur'
import { generateDailyDigest, generateWeeklyReport, generateMonthlyReport } from './sous-agents/7b-generateur'
import { generateRecommendations } from './sous-agents/7d-recommandeur'
import { evaluateRunningABTests } from './sous-agents/7d-ab-testing'

// === QUOTIDIEN ===

// 21:30 - Collecte metriques
cron.schedule('30 21 * * *', async () => {
  console.log('[CRON] 21:30 - Collecte metriques quotidiennes')
  await collectDailySnapshot()
})

// 21:45 - Detection anomalies
cron.schedule('45 21 * * *', async () => {
  console.log('[CRON] 21:45 - Detection anomalies')
  await detectAnomalies()
})

// 22:00 - Digest quotidien
cron.schedule('0 22 * * *', async () => {
  console.log('[CRON] 22:00 - Digest quotidien')
  await generateDailyDigest()
})

// 22:15 - Evaluation A/B tests
cron.schedule('15 22 * * *', async () => {
  console.log('[CRON] 22:15 - Evaluation A/B tests')
  await evaluateRunningABTests()
})

// === HEBDOMADAIRE (Lundi) ===

// Lundi 09:00 - Rapport hebdomadaire
cron.schedule('0 9 * * 1', async () => {
  console.log('[CRON] Lundi 09:00 - Rapport hebdomadaire')
  await generateWeeklyReport()
})

// Lundi 09:30 - Recommandations
cron.schedule('30 9 * * 1', async () => {
  console.log('[CRON] Lundi 09:30 - Recommandations hebdomadaires')
  await generateRecommendations()
})

// === MENSUEL (1er du mois) ===

// 1er du mois, 09:00 - Rapport mensuel
cron.schedule('0 9 1 * *', async () => {
  console.log('[CRON] 1er du mois - Rapport mensuel strategique')
  await generateMonthlyReport()
})

// 1er du mois, 10:00 - Recalculer attribution
cron.schedule('0 10 1 * *', async () => {
  console.log('[CRON] 1er du mois - Recalcul attribution multi-touch')
  // Execute la requete d'attribution U-Shaped (section 5.3)
})

console.log('[Agent 7] Scheduler demarré -- ANALYSTE operationnel')
console.log('[Agent 7] Prochain digest : 22h00')
console.log('[Agent 7] Prochain rapport hebdo : Lundi 09h00')
```

---

## ANNEXE B : VARIABLES D'ENVIRONNEMENT

```bash
# === Agent 7 ANALYSTE ===

# PostgreSQL (lecture sur toutes les tables)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=axiom_pipeline
PG_USER=analyste
PG_PASSWORD=xxxx

# Claude API (rapports + recommandations)
ANTHROPIC_API_KEY=sk-ant-xxxx

# Slack
SLACK_BOT_TOKEN=xoxb-xxxx
SLACK_CHANNEL_METRICS=#pipeline-metrics
SLACK_CHANNEL_ALERTS=#alerts-critical
JONATHAN_SLACK_ID=U0XXXXXXX

# Gmail (envoi rapports)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
REPORT_EMAIL_FROM=analytics@axiom-marketing.fr
REPORT_EMAIL_TO=jonathan@axiom-marketing.fr

# Metabase
METABASE_URL=http://localhost:3000
METABASE_ADMIN_TOKEN=xxxx

# Configuration
MONTHLY_REVENUE_TARGET=50000
PHASE=1
```

---

## ANNEXE C : DIAGRAMME DU SYSTEME COMPLET (7 AGENTS)

```
                    ┌──────────────────────────────────────────────────────┐
                    │                SOURCES EXTERNES                       │
                    │  LinkedIn    Marches    Sites Web    Job Boards       │
                    └──────────┬─────────┬──────────┬─────────┬────────────┘
                               │         │          │         │
                               ▼         ▼          ▼         ▼
                    ┌──────────────────────────────────────────────────────┐
                    │              AGENT 1 -- VEILLEUR (430 EUR/mois)      │
                    │  1a LinkedIn | 1b Marches | 1c Web | 1d Job Boards  │
                    │  Output : leads_bruts (30-80/jour)                   │
                    └───────────────────────┬──────────────────────────────┘
                                            │ BullMQ 'enrichisseur-pipeline'
                                            ▼
                    ┌──────────────────────────────────────────────────────┐
                    │          AGENT 2 -- ENRICHISSEUR (180 EUR/mois)      │
                    │  APIs : Societe.com, Pappers, Hunter, DropContact   │
                    │  Output : prospect enrichi (8-20/jour)              │
                    └───────────────────────┬──────────────────────────────┘
                                            │ BullMQ 'scoreur-pipeline'
                    ┌───────────────────────┼──────────────────────────────┐
                    │                       ▼                              │
                    │  ┌──────────────────────────────────────────────┐   │
                    │  │      AGENT 3 -- SCOREUR (0 EUR/mois)         │   │
                    │  │  4 axes : ICP + Signaux + Tech + Engagement  │   │
                    │  │  Output : score 0-100, HOT/WARM/COLD/DISQ   │   │
                    │  └───────────────────────┬──────────────────────┘   │
                    │                           │ BullMQ 'redacteur-pipe' │
                    │                           ▼                        │
                    │  ┌──────────────────────────────────────────────┐   │
  BOUCLE            │  │      AGENT 4 -- REDACTEUR (25 EUR/mois)      │   │
  NURTURE ──────────┤  │  Claude API, templates, A/B variants         │   │
  (Agent 6→3)       │  │  Output : message pret a envoyer             │   │
                    │  └───────────────────────┬──────────────────────┘   │
                    │                           │ BullMQ 'suiveur-pipe'   │
                    │                           ▼                        │
                    │  ┌──────────────────────────────────────────────┐   │
                    │  │      AGENT 5 -- SUIVEUR (150 EUR/mois)       │   │
                    │  │  Email (Gmail API) + LinkedIn (Waalaxy)      │   │
                    │  │  Classification reponses (Claude API)        │   │
                    │  │  Notifications Slack interactives            │   │
                    │  └───────┬──────────────────────────┬──────────┘   │
                    │           │                          │              │
                    │           │ BullMQ 'nurturer-pipe'   │              │
                    │           ▼                          │              │
                    │  ┌────────────────────────────────┐  │              │
                    │  │ AGENT 6 -- NURTUREUR (37 EUR)  │  │              │
                    │  │ Email nurture + LinkedIn passif│  │              │
                    │  │ Re-scoring mensuel             │  │              │
                    │  │ Sunset policy                  │──┼── vers Agent 3
                    │  └─────────────────────┬──────────┘  │ (reclassif.)
                    │                         │            │              │
                    └─────────────────────────┼────────────┼──────────────┘
                                              │            │
                                              ▼            ▼
                    ┌──────────────────────────────────────────────────────┐
                    │          AGENT 7 -- ANALYSTE (50 EUR/mois)           │
                    │                                                      │
                    │  7a COLLECTEUR     → metriques_daily (21h30)        │
                    │  7b GENERATEUR     → rapports Slack + email          │
                    │  7c DETECTEUR      → alertes anomalies               │
                    │  7d RECOMMANDEUR   → recommandations par agent       │
                    │                                                      │
                    │  Dashboard Metabase | Attribution | A/B Testing      │
                    │  Forecasting 30/60/90j | Feedback loops              │
                    └──────────────────────────────────────────────────────┘
                                              │
                                    Feedback vers tous les agents
                                    (apres validation Jonathan)

TOTAL SYSTEME : ~1 175 EUR/mois | ROI minimum : 29x
```

---

## INTEGRATION AVEC LES AGENTS 8, 9, 10

### Nouvelles sources de donnees

L'Analyste collecte desormais les metriques de 10 agents (au lieu de 7).

**Agent 8 (DEALMAKER)** — Tables a interroger :
- `deals` : pipeline CRM, etapes, montants
- `devis_generes` : devis envoyes, ouverts, acceptes
- `relances_deals` : sequences post-devis
- `signatures` : contrats signes via Yousign

KPIs supplementaires :
- Win rate (deals gagnes / deals crees)
- Deal velocity (jours moyen de closing)
- Pipeline value (montant total en cours)
- Conversion par etape CRM

**Agent 9 (APPELS D'OFFRES)** — Tables a interroger :
- `ao_analyses` : AO detectes et analyses
- `ao_reponses` : reponses soumises
- `ao_resultats` : gagnes/perdus/en attente

KPIs supplementaires :
- Taux GO/NO-GO (% des AO qualifies auxquels on repond)
- Taux de succes (gagnes / deposes)
- ROI par AO (revenue gagne / cout de reponse)
- Temps moyen de preparation

**Agent 10 (CSM)** — Tables a interroger :
- `clients` : base clients active
- `health_scores` : scores de sante quotidiens
- `nps_surveys` : resultats NPS/CSAT
- `upsell_opportunities` : opportunites detectees
- `referrals` : referrals envoyes et convertis

KPIs supplementaires :
- NPS moyen
- Taux de retention (clients renouveles / total)
- Taux de churn
- Revenue upsell (% du CA total)
- Referral conversion rate
- CLV (Customer Lifetime Value)

### Rapports etendus

Le digest quotidien, le rapport hebdomadaire et le rapport mensuel incluent desormais 3 blocs supplementaires pour les agents 8, 9, 10.

### Contexte mis a jour
Le systeme compte desormais **10 agents** (et non 7). Le cout total est de **~1 175 EUR/mois**.

---

**FIN DU DOCUMENT -- SYSTEME COMPLET DE 10 AGENTS BOUCLE**

*Le systeme de prospection automatisee Axiom Marketing est maintenant entierement specifie. Les 10 agents couvrent la chaine complete de la detection de leads jusqu'a l'analyse et l'optimisation continue. Chaque input est un output d'un autre agent. Chaque metrique est mesuree. Chaque anomalie est detectee. Chaque recommandation est tracee.*
