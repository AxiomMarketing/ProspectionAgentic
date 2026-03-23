# AGENT 7 -- ANALYSTE : SPECIFICATIONS TECHNIQUES COMPLETES

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B multicanal (7 agents)
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
7. [Feedback loop](#7-feedback-loop)
8. [Forecasting](#8-forecasting)
9. [Rapports](#9-rapports)
10. [Alertes](#10-alertes)
11. [Dashboard](#11-dashboard)
12. [Couts](#12-couts)
13. [Verification de coherence globale](#13-verification-de-coherence-globale)

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

### 3.3 Sous-Agent 7a -- Collecteur de Metriques

#### Mission

Executer des requetes SQL quotidiennes sur TOUTES les tables du pipeline, calculer les metriques derivees, et les persister dans la table `metriques_daily` pour historisation et trending.

#### Table SQL : metriques_daily

```sql
-- ============================================
-- SCHEMA AGENT 7 -- ANALYSTE
-- PostgreSQL 16
-- ============================================

-- Table principale : snapshots metriques quotidiens
CREATE TABLE IF NOT EXISTS metriques_daily (
  id SERIAL PRIMARY KEY,
  date_snapshot DATE NOT NULL,

  -- === Agent 1 : VEILLEUR ===
  veilleur_leads_bruts INTEGER DEFAULT 0,
  veilleur_leads_linkedin INTEGER DEFAULT 0,
  veilleur_leads_marches INTEGER DEFAULT 0,
  veilleur_leads_web INTEGER DEFAULT 0,
  veilleur_leads_jobboards INTEGER DEFAULT 0,
  veilleur_leads_qualifies INTEGER DEFAULT 0,         -- pre_score >= 60
  veilleur_pre_score_moyen NUMERIC(5,2) DEFAULT 0,
  veilleur_taux_deduplication NUMERIC(5,2) DEFAULT 0, -- % duplicats detectes
  veilleur_cout_api_eur NUMERIC(8,2) DEFAULT 0,

  -- === Agent 2 : ENRICHISSEUR ===
  enrichisseur_prospects_traites INTEGER DEFAULT 0,
  enrichisseur_emails_trouves INTEGER DEFAULT 0,
  enrichisseur_emails_non_trouves INTEGER DEFAULT 0,
  enrichisseur_taux_enrichissement NUMERIC(5,2) DEFAULT 0,   -- %
  enrichisseur_taux_email_valide NUMERIC(5,2) DEFAULT 0,     -- %
  enrichisseur_temps_moyen_ms INTEGER DEFAULT 0,
  enrichisseur_cout_api_eur NUMERIC(8,2) DEFAULT 0,

  -- === Agent 3 : SCOREUR ===
  scoreur_prospects_scores INTEGER DEFAULT 0,
  scoreur_nb_hot INTEGER DEFAULT 0,
  scoreur_nb_warm INTEGER DEFAULT 0,
  scoreur_nb_cold INTEGER DEFAULT 0,
  scoreur_nb_disqualifie INTEGER DEFAULT 0,
  scoreur_score_moyen NUMERIC(5,2) DEFAULT 0,
  scoreur_pct_hot NUMERIC(5,2) DEFAULT 0,
  scoreur_pct_warm NUMERIC(5,2) DEFAULT 0,
  scoreur_pct_cold NUMERIC(5,2) DEFAULT 0,
  scoreur_pct_disqualifie NUMERIC(5,2) DEFAULT 0,
  scoreur_reclassifications INTEGER DEFAULT 0,

  -- === Agent 4 : REDACTEUR ===
  redacteur_messages_generes INTEGER DEFAULT 0,
  redacteur_cout_generation_eur NUMERIC(8,2) DEFAULT 0,
  redacteur_temps_moyen_generation_ms INTEGER DEFAULT 0,
  redacteur_templates_actifs INTEGER DEFAULT 0,
  redacteur_ab_tests_en_cours INTEGER DEFAULT 0,

  -- === Agent 5 : SUIVEUR ===
  suiveur_emails_envoyes INTEGER DEFAULT 0,
  suiveur_linkedin_connections INTEGER DEFAULT 0,
  suiveur_linkedin_messages INTEGER DEFAULT 0,
  suiveur_emails_bounced INTEGER DEFAULT 0,
  suiveur_bounce_rate NUMERIC(5,2) DEFAULT 0,
  suiveur_reponses_total INTEGER DEFAULT 0,
  suiveur_reponses_positives INTEGER DEFAULT 0,           -- INTERESSE + INTERESSE_SOFT
  suiveur_reponses_negatives INTEGER DEFAULT 0,           -- PAS_INTERESSE + SPAM
  suiveur_reponses_pas_maintenant INTEGER DEFAULT 0,
  suiveur_reply_rate NUMERIC(5,2) DEFAULT 0,
  suiveur_positive_reply_rate NUMERIC(5,2) DEFAULT 0,
  suiveur_sequences_actives INTEGER DEFAULT 0,
  suiveur_sequences_completees INTEGER DEFAULT 0,
  suiveur_sla_breaches INTEGER DEFAULT 0,
  suiveur_opt_outs INTEGER DEFAULT 0,
  suiveur_cout_eur NUMERIC(8,2) DEFAULT 0,

  -- === Agent 6 : NURTUREUR ===
  nurtureur_total_en_nurture INTEGER DEFAULT 0,
  nurtureur_nouveaux_entres INTEGER DEFAULT 0,
  nurtureur_emails_nurture_envoyes INTEGER DEFAULT 0,
  nurtureur_taux_ouverture NUMERIC(5,2) DEFAULT 0,
  nurtureur_taux_clic NUMERIC(5,2) DEFAULT 0,
  nurtureur_reclassifies_hot INTEGER DEFAULT 0,
  nurtureur_sunset INTEGER DEFAULT 0,
  nurtureur_opt_outs INTEGER DEFAULT 0,
  nurtureur_engagement_score_moyen NUMERIC(5,2) DEFAULT 0,
  nurtureur_cout_eur NUMERIC(8,2) DEFAULT 0,

  -- === Pipeline global ===
  pipeline_leads_generes INTEGER DEFAULT 0,              -- Total leads bruts du jour
  pipeline_prospects_contactes INTEGER DEFAULT 0,         -- Total contacted (email + linkedin)
  pipeline_reponses_positives INTEGER DEFAULT 0,          -- Total interested
  pipeline_rdv_bookes INTEGER DEFAULT 0,                 -- Meetings scheduled
  pipeline_propositions_envoyees INTEGER DEFAULT 0,       -- Proposals sent
  pipeline_deals_gagnes INTEGER DEFAULT 0,               -- Won deals
  pipeline_deals_perdus INTEGER DEFAULT 0,               -- Lost deals
  pipeline_revenu_jour NUMERIC(12,2) DEFAULT 0,          -- Revenue du jour
  pipeline_valeur_totale NUMERIC(12,2) DEFAULT 0,        -- Total pipeline value
  pipeline_velocity_jour NUMERIC(10,2) DEFAULT 0,        -- Pipeline velocity (EUR/jour)

  -- === Couts ===
  cout_total_jour_eur NUMERIC(8,2) DEFAULT 0,            -- Cout total du pipeline pour le jour
  cout_claude_api_eur NUMERIC(8,2) DEFAULT 0,
  cout_apis_externes_eur NUMERIC(8,2) DEFAULT 0,
  cout_infrastructure_eur NUMERIC(8,2) DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  snapshot_version VARCHAR(10) DEFAULT '1.0',

  UNIQUE(date_snapshot)
);

CREATE INDEX idx_metriques_daily_date ON metriques_daily(date_snapshot DESC);
```

#### Code TypeScript : Collecteur de Metriques

```typescript
// sous-agents/7a-collecteur.ts
import { Pool } from 'pg'

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'axiom_pipeline',
  user: process.env.PG_USER || 'analyste',
  password: process.env.PG_PASSWORD,
  max: 5,
})

interface DailySnapshot {
  date_snapshot: string
  // Agent 1
  veilleur_leads_bruts: number
  veilleur_leads_linkedin: number
  veilleur_leads_marches: number
  veilleur_leads_web: number
  veilleur_leads_jobboards: number
  veilleur_leads_qualifies: number
  veilleur_pre_score_moyen: number
  veilleur_taux_deduplication: number
  veilleur_cout_api_eur: number
  // Agent 2
  enrichisseur_prospects_traites: number
  enrichisseur_emails_trouves: number
  enrichisseur_emails_non_trouves: number
  enrichisseur_taux_enrichissement: number
  enrichisseur_taux_email_valide: number
  enrichisseur_temps_moyen_ms: number
  enrichisseur_cout_api_eur: number
  // Agent 3
  scoreur_prospects_scores: number
  scoreur_nb_hot: number
  scoreur_nb_warm: number
  scoreur_nb_cold: number
  scoreur_nb_disqualifie: number
  scoreur_score_moyen: number
  scoreur_pct_hot: number
  scoreur_pct_warm: number
  scoreur_pct_cold: number
  scoreur_pct_disqualifie: number
  scoreur_reclassifications: number
  // Agent 4
  redacteur_messages_generes: number
  redacteur_cout_generation_eur: number
  redacteur_temps_moyen_generation_ms: number
  redacteur_templates_actifs: number
  redacteur_ab_tests_en_cours: number
  // Agent 5
  suiveur_emails_envoyes: number
  suiveur_linkedin_connections: number
  suiveur_linkedin_messages: number
  suiveur_emails_bounced: number
  suiveur_bounce_rate: number
  suiveur_reponses_total: number
  suiveur_reponses_positives: number
  suiveur_reponses_negatives: number
  suiveur_reponses_pas_maintenant: number
  suiveur_reply_rate: number
  suiveur_positive_reply_rate: number
  suiveur_sequences_actives: number
  suiveur_sequences_completees: number
  suiveur_sla_breaches: number
  suiveur_opt_outs: number
  suiveur_cout_eur: number
  // Agent 6
  nurtureur_total_en_nurture: number
  nurtureur_nouveaux_entres: number
  nurtureur_emails_nurture_envoyes: number
  nurtureur_taux_ouverture: number
  nurtureur_taux_clic: number
  nurtureur_reclassifies_hot: number
  nurtureur_sunset: number
  nurtureur_opt_outs: number
  nurtureur_engagement_score_moyen: number
  nurtureur_cout_eur: number
  // Pipeline global
  pipeline_leads_generes: number
  pipeline_prospects_contactes: number
  pipeline_reponses_positives: number
  pipeline_rdv_bookes: number
  pipeline_propositions_envoyees: number
  pipeline_deals_gagnes: number
  pipeline_deals_perdus: number
  pipeline_revenu_jour: number
  pipeline_valeur_totale: number
  pipeline_velocity_jour: number
  // Couts
  cout_total_jour_eur: number
  cout_claude_api_eur: number
  cout_apis_externes_eur: number
  cout_infrastructure_eur: number
}

// === REQUETES SQL PAR AGENT ===

async function collectVeilleurMetrics(date: string): Promise<Partial<DailySnapshot>> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_leads,
      COUNT(*) FILTER (WHERE source_primaire = '1a_linkedin') as leads_linkedin,
      COUNT(*) FILTER (WHERE source_primaire = '1b_marches') as leads_marches,
      COUNT(*) FILTER (WHERE source_primaire = '1c_web') as leads_web,
      COUNT(*) FILTER (WHERE source_primaire = '1d_jobboards') as leads_jobboards,
      COUNT(*) FILTER (WHERE pre_score >= 60) as leads_qualifies,
      COALESCE(AVG(pre_score), 0) as pre_score_moyen
    FROM leads_bruts
    WHERE DATE(created_at) = $1
  `, [date])

  const dedup = await pool.query(`
    SELECT COUNT(*) as duplicats
    FROM deduplication_log
    WHERE DATE(created_at) = $1
  `, [date])

  const apiCosts = await pool.query(`
    SELECT COALESCE(SUM(cost_eur), 0) as total_cost
    FROM api_usage
    WHERE DATE(called_at) = $1
      AND api_provider IN ('netrows', 'signalsapi', 'apify', 'hasdata', 'whoisfreaks')
  `, [date])

  const row = result.rows[0]
  const totalLeads = parseInt(row.total_leads) || 0
  const dupsCount = parseInt(dedup.rows[0]?.duplicats) || 0

  return {
    veilleur_leads_bruts: totalLeads,
    veilleur_leads_linkedin: parseInt(row.leads_linkedin) || 0,
    veilleur_leads_marches: parseInt(row.leads_marches) || 0,
    veilleur_leads_web: parseInt(row.leads_web) || 0,
    veilleur_leads_jobboards: parseInt(row.leads_jobboards) || 0,
    veilleur_leads_qualifies: parseInt(row.leads_qualifies) || 0,
    veilleur_pre_score_moyen: parseFloat(row.pre_score_moyen) || 0,
    veilleur_taux_deduplication: totalLeads > 0
      ? Math.round((dupsCount / (totalLeads + dupsCount)) * 10000) / 100
      : 0,
    veilleur_cout_api_eur: parseFloat(apiCosts.rows[0]?.total_cost) || 0,
  }
}

async function collectEnrichisseurMetrics(date: string): Promise<Partial<DailySnapshot>> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_traites,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') as emails_trouves,
      COUNT(*) FILTER (WHERE email IS NULL OR email = '') as emails_non_trouves,
      ROUND(
        COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '')::numeric /
        NULLIF(COUNT(*), 0) * 100, 2
      ) as taux_enrichissement
    FROM prospects
    WHERE DATE(updated_at) = $1
      AND statut = 'enrichi'
  `, [date])

  const emailValid = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE result = 'valid') as valides,
      COUNT(*) as total
    FROM email_verifications
    WHERE DATE(verified_at) = $1
  `, [date])

  const costs = await pool.query(`
    SELECT COALESCE(SUM(cost_eur), 0) as total
    FROM api_usage
    WHERE DATE(called_at) = $1
      AND api_provider IN ('hunter', 'dropcontact', 'societecom', 'pappers')
  `, [date])

  const row = result.rows[0]
  const emailRow = emailValid.rows[0]

  return {
    enrichisseur_prospects_traites: parseInt(row.total_traites) || 0,
    enrichisseur_emails_trouves: parseInt(row.emails_trouves) || 0,
    enrichisseur_emails_non_trouves: parseInt(row.emails_non_trouves) || 0,
    enrichisseur_taux_enrichissement: parseFloat(row.taux_enrichissement) || 0,
    enrichisseur_taux_email_valide: emailRow.total > 0
      ? Math.round((emailRow.valides / emailRow.total) * 10000) / 100
      : 0,
    enrichisseur_cout_api_eur: parseFloat(costs.rows[0]?.total) || 0,
  }
}

async function collectScoreurMetrics(date: string): Promise<Partial<DailySnapshot>> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_scored,
      COUNT(*) FILTER (WHERE categorie = 'HOT') as nb_hot,
      COUNT(*) FILTER (WHERE categorie = 'WARM') as nb_warm,
      COUNT(*) FILTER (WHERE categorie = 'COLD') as nb_cold,
      COUNT(*) FILTER (WHERE categorie = 'DISQUALIFIE') as nb_disq,
      COALESCE(AVG(score_total), 0) as score_moyen,
      ROUND(COUNT(*) FILTER (WHERE categorie = 'HOT')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as pct_hot,
      ROUND(COUNT(*) FILTER (WHERE categorie = 'WARM')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as pct_warm,
      ROUND(COUNT(*) FILTER (WHERE categorie = 'COLD')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as pct_cold,
      ROUND(COUNT(*) FILTER (WHERE categorie = 'DISQUALIFIE')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as pct_disq
    FROM scores
    WHERE DATE(scored_at) = $1
  `, [date])

  const reclassif = await pool.query(`
    SELECT COUNT(*) as total
    FROM score_history
    WHERE DATE(created_at) = $1
      AND ancienne_categorie != nouvelle_categorie
  `, [date])

  const row = result.rows[0]

  return {
    scoreur_prospects_scores: parseInt(row.total_scored) || 0,
    scoreur_nb_hot: parseInt(row.nb_hot) || 0,
    scoreur_nb_warm: parseInt(row.nb_warm) || 0,
    scoreur_nb_cold: parseInt(row.nb_cold) || 0,
    scoreur_nb_disqualifie: parseInt(row.nb_disq) || 0,
    scoreur_score_moyen: parseFloat(row.score_moyen) || 0,
    scoreur_pct_hot: parseFloat(row.pct_hot) || 0,
    scoreur_pct_warm: parseFloat(row.pct_warm) || 0,
    scoreur_pct_cold: parseFloat(row.pct_cold) || 0,
    scoreur_pct_disqualifie: parseFloat(row.pct_disq) || 0,
    scoreur_reclassifications: parseInt(reclassif.rows[0]?.total) || 0,
  }
}

async function collectSuiveurMetrics(date: string): Promise<Partial<DailySnapshot>> {
  const envoi = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE canal = 'email') as emails_envoyes,
      COUNT(*) FILTER (WHERE canal = 'linkedin' AND action_type = 'connection_sent') as linkedin_connections,
      COUNT(*) FILTER (WHERE canal = 'linkedin' AND action_type = 'message_sent') as linkedin_messages,
      COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced
    FROM email_sends
    WHERE DATE(sent_at) = $1
  `, [date])

  const reponses = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE category IN ('INTERESSE', 'INTERESSE_SOFT')) as positives,
      COUNT(*) FILTER (WHERE category IN ('PAS_INTERESSE', 'SPAM', 'WRONG_PERSON')) as negatives,
      COUNT(*) FILTER (WHERE category = 'PAS_MAINTENANT') as pas_maintenant
    FROM reply_classifications
    WHERE DATE(classified_at) = $1
  `, [date])

  const sequences = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE sequence_status = 'ACTIVE') as actives,
      COUNT(*) FILTER (WHERE sequence_status = 'COMPLETED' AND DATE(updated_at) = $1) as completees
    FROM prospect_sequences
    WHERE (sequence_status = 'ACTIVE') OR (DATE(updated_at) = $1)
  `, [date])

  const sla = await pool.query(`
    SELECT COUNT(*) as breaches
    FROM notifications
    WHERE DATE(created_at) = $1
      AND escalated = true
  `, [date])

  const optouts = await pool.query(`
    SELECT COUNT(*) as total
    FROM rgpd_events
    WHERE DATE(created_at) = $1
      AND type = 'opt_out'
  `, [date])

  const e = envoi.rows[0]
  const r = reponses.rows[0]
  const s = sequences.rows[0]
  const emailsSent = parseInt(e.emails_envoyes) || 0
  const totalReponses = parseInt(r.total) || 0

  return {
    suiveur_emails_envoyes: emailsSent,
    suiveur_linkedin_connections: parseInt(e.linkedin_connections) || 0,
    suiveur_linkedin_messages: parseInt(e.linkedin_messages) || 0,
    suiveur_emails_bounced: parseInt(e.bounced) || 0,
    suiveur_bounce_rate: emailsSent > 0
      ? Math.round((parseInt(e.bounced) / emailsSent) * 10000) / 100
      : 0,
    suiveur_reponses_total: totalReponses,
    suiveur_reponses_positives: parseInt(r.positives) || 0,
    suiveur_reponses_negatives: parseInt(r.negatives) || 0,
    suiveur_reponses_pas_maintenant: parseInt(r.pas_maintenant) || 0,
    suiveur_reply_rate: emailsSent > 0
      ? Math.round((totalReponses / emailsSent) * 10000) / 100
      : 0,
    suiveur_positive_reply_rate: emailsSent > 0
      ? Math.round((parseInt(r.positives) / emailsSent) * 10000) / 100
      : 0,
    suiveur_sequences_actives: parseInt(s.actives) || 0,
    suiveur_sequences_completees: parseInt(s.completees) || 0,
    suiveur_sla_breaches: parseInt(sla.rows[0]?.breaches) || 0,
    suiveur_opt_outs: parseInt(optouts.rows[0]?.total) || 0,
  }
}

async function collectNurtureurMetrics(date: string): Promise<Partial<DailySnapshot>> {
  const status = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE nurture_status IN ('ACTIVE', 'RE_ENGAGED')) as total_actifs,
      COUNT(*) FILTER (WHERE DATE(created_at) = $1) as nouveaux,
      COUNT(*) FILTER (WHERE nurture_status = 'RECLASSIFIED_HOT' AND DATE(updated_at) = $1) as reclassifies,
      COUNT(*) FILTER (WHERE nurture_status = 'SUNSET' AND DATE(updated_at) = $1) as sunset,
      COUNT(*) FILTER (WHERE nurture_status = 'OPTED_OUT' AND DATE(updated_at) = $1) as opt_outs,
      COALESCE(AVG(engagement_score_current) FILTER (WHERE nurture_status IN ('ACTIVE', 'RE_ENGAGED')), 0) as engagement_moyen
    FROM nurture_prospects
  `, [date])

  const emails = await pool.query(`
    SELECT
      COUNT(*) as envoyes,
      COUNT(*) FILTER (WHERE status IN ('OPENED', 'CLICKED', 'REPLIED')) as ouverts,
      COUNT(*) FILTER (WHERE status IN ('CLICKED', 'REPLIED')) as cliques
    FROM nurture_emails
    WHERE DATE(sent_at) = $1
  `, [date])

  const st = status.rows[0]
  const em = emails.rows[0]
  const envoyes = parseInt(em.envoyes) || 0

  return {
    nurtureur_total_en_nurture: parseInt(st.total_actifs) || 0,
    nurtureur_nouveaux_entres: parseInt(st.nouveaux) || 0,
    nurtureur_emails_nurture_envoyes: envoyes,
    nurtureur_taux_ouverture: envoyes > 0
      ? Math.round((parseInt(em.ouverts) / envoyes) * 10000) / 100
      : 0,
    nurtureur_taux_clic: envoyes > 0
      ? Math.round((parseInt(em.cliques) / envoyes) * 10000) / 100
      : 0,
    nurtureur_reclassifies_hot: parseInt(st.reclassifies) || 0,
    nurtureur_sunset: parseInt(st.sunset) || 0,
    nurtureur_opt_outs: parseInt(st.opt_outs) || 0,
    nurtureur_engagement_score_moyen: parseFloat(st.engagement_moyen) || 0,
  }
}

async function collectPipelineMetrics(date: string): Promise<Partial<DailySnapshot>> {
  const outcomes = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE outcome = 'converti') as deals_gagnes,
      COUNT(*) FILTER (WHERE outcome IN ('pas_interesse', 'disqualifie_post')) as deals_perdus,
      COALESCE(SUM(montant_deal) FILTER (WHERE outcome = 'converti'), 0) as revenu_jour,
      COUNT(*) FILTER (WHERE outcome IN ('interesse', 'opportunite')) as rdv_propositions
    FROM prospect_outcomes
    WHERE DATE(date_outcome) = $1
  `, [date])

  const pipelineValue = await pool.query(`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN outcome = 'opportunite' THEN montant_deal * 0.50
          WHEN outcome = 'interesse' THEN montant_deal * 0.25
          ELSE 0
        END
      ), 0) as weighted_pipeline
    FROM prospect_outcomes
    WHERE outcome IN ('opportunite', 'interesse')
      AND date_outcome >= NOW() - INTERVAL '90 days'
  `)

  const o = outcomes.rows[0]
  const pv = pipelineValue.rows[0]

  // Pipeline velocity = (opportunities * avg_deal * win_rate) / cycle_days
  const velocityResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE outcome IN ('converti', 'opportunite', 'interesse')) as opportunities,
      COALESCE(AVG(montant_deal) FILTER (WHERE outcome = 'converti'), 0) as avg_deal,
      COALESCE(
        COUNT(*) FILTER (WHERE outcome = 'converti')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE outcome IN ('converti', 'pas_interesse', 'pas_de_reponse', 'disqualifie_post')), 0),
        0
      ) as win_rate,
      COALESCE(AVG(cycle_vente_jours) FILTER (WHERE outcome = 'converti'), 30) as avg_cycle
    FROM prospect_outcomes
    WHERE date_outcome >= NOW() - INTERVAL '90 days'
  `)

  const v = velocityResult.rows[0]
  const velocity = parseFloat(v.avg_cycle) > 0
    ? (parseInt(v.opportunities) * parseFloat(v.avg_deal) * parseFloat(v.win_rate)) / parseFloat(v.avg_cycle)
    : 0

  return {
    pipeline_leads_generes: 0, // Rempli par veilleur_leads_bruts
    pipeline_deals_gagnes: parseInt(o.deals_gagnes) || 0,
    pipeline_deals_perdus: parseInt(o.deals_perdus) || 0,
    pipeline_revenu_jour: parseFloat(o.revenu_jour) || 0,
    pipeline_valeur_totale: parseFloat(pv.weighted_pipeline) || 0,
    pipeline_velocity_jour: Math.round(velocity * 100) / 100,
  }
}

// === FONCTION PRINCIPALE : SNAPSHOT QUOTIDIEN ===

export async function collectDailySnapshot(date?: string): Promise<void> {
  const snapshotDate = date || new Date().toISOString().split('T')[0]
  console.log(`[7a] Collecte metriques pour ${snapshotDate}...`)

  const [veilleur, enrichisseur, scoreur, suiveur, nurtureur, pipeline] = await Promise.all([
    collectVeilleurMetrics(snapshotDate),
    collectEnrichisseurMetrics(snapshotDate),
    collectScoreurMetrics(snapshotDate),
    collectSuiveurMetrics(snapshotDate),
    collectNurtureurMetrics(snapshotDate),
    collectPipelineMetrics(snapshotDate),
  ])

  // Calculer les couts totaux
  const coutTotal = (veilleur.veilleur_cout_api_eur || 0)
    + (enrichisseur.enrichisseur_cout_api_eur || 0)
    + (suiveur.suiveur_cout_eur || 0)
    + (nurtureur.nurtureur_cout_eur || 0)

  const snapshot: DailySnapshot = {
    date_snapshot: snapshotDate,
    ...veilleur,
    ...enrichisseur,
    ...scoreur,
    ...suiveur,
    ...nurtureur,
    ...pipeline,
    pipeline_leads_generes: veilleur.veilleur_leads_bruts || 0,
    cout_total_jour_eur: coutTotal,
    cout_claude_api_eur: (enrichisseur.enrichisseur_cout_api_eur || 0) * 0.1 // Estimation part Claude
      + (suiveur.suiveur_cout_eur || 0) * 0.3
      + (nurtureur.nurtureur_cout_eur || 0) * 0.5,
    cout_apis_externes_eur: (veilleur.veilleur_cout_api_eur || 0)
      + (enrichisseur.enrichisseur_cout_api_eur || 0) * 0.9,
    cout_infrastructure_eur: coutTotal * 0.1, // ~10% des couts = infrastructure
  } as DailySnapshot

  // Upsert dans metriques_daily
  const columns = Object.keys(snapshot)
  const values = Object.values(snapshot)
  const placeholders = values.map((_, i) => `$${i + 1}`)
  const updates = columns
    .filter(c => c !== 'date_snapshot')
    .map(c => `${c} = EXCLUDED.${c}`)

  await pool.query(`
    INSERT INTO metriques_daily (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (date_snapshot)
    DO UPDATE SET ${updates.join(', ')}
  `, values)

  console.log(`[7a] Snapshot ${snapshotDate} sauvegarde (${veilleur.veilleur_leads_bruts} leads, ${scoreur.scoreur_prospects_scores} scores, ${suiveur.suiveur_emails_envoyes} emails)`)
}
```

#### Format de sortie

Chaque jour a 21h30, la table `metriques_daily` est peuplee avec une ligne contenant ~60 metriques couvrant tous les agents. Cette table est la source de verite pour les rapports, les alertes et les tendances.

---

### 3.4 Sous-Agent 7b -- Generateur de Rapports

#### Mission

Generer 3 types de rapports a frequence fixe : digest quotidien (22h), rapport hebdomadaire (lundi 9h), rapport mensuel strategique (1er du mois). Chaque rapport est genere en texte structure, resume par Claude API, et envoye via Slack + email.

#### Code TypeScript : Generateur de Rapports

```typescript
// sous-agents/7b-generateur.ts
import Anthropic from '@anthropic-ai/sdk'
import { WebClient } from '@slack/web-api'
import { Pool } from 'pg'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const slack = new WebClient(process.env.SLACK_BOT_TOKEN)
const pool = new Pool({ /* config */ })

// === DIGEST QUOTIDIEN (22h) ===

export async function generateDailyDigest(date?: string): Promise<string> {
  const snapshotDate = date || new Date().toISOString().split('T')[0]

  // Charger les metriques du jour et de la veille
  const result = await pool.query(`
    SELECT *
    FROM metriques_daily
    WHERE date_snapshot IN ($1, $1::date - 1)
    ORDER BY date_snapshot DESC
  `, [snapshotDate])

  const today = result.rows[0]
  const yesterday = result.rows[1]

  if (!today) {
    console.error(`[7b] Pas de snapshot pour ${snapshotDate}`)
    return ''
  }

  // Calculer les deltas
  const delta = (field: string): string => {
    if (!yesterday) return 'N/A'
    const todayVal = parseFloat(today[field]) || 0
    const yestVal = parseFloat(yesterday[field]) || 0
    const diff = todayVal - yestVal
    const pct = yestVal > 0 ? Math.round((diff / yestVal) * 100) : 0
    if (diff > 0) return `+${diff} (+${pct}%)`
    if (diff < 0) return `${diff} (${pct}%)`
    return '='
  }

  // Determiner le statut global
  const replyRate = today.suiveur_reply_rate || 0
  const bounceRate = today.suiveur_bounce_rate || 0
  const healthStatus = replyRate >= 5 && bounceRate < 2 ? 'VERT' :
    replyRate >= 3 && bounceRate < 3 ? 'JAUNE' : 'ROUGE'

  const digestText = `
AXIOM MARKETING -- DIGEST QUOTIDIEN
${snapshotDate} | Statut: ${healthStatus}
${'='.repeat(50)}

PIPELINE AUJOURD'HUI :
  Leads detectes : ${today.veilleur_leads_bruts} (${delta('veilleur_leads_bruts')})
  Leads qualifies : ${today.veilleur_leads_qualifies} (${delta('veilleur_leads_qualifies')})
  Emails envoyes : ${today.suiveur_emails_envoyes} (${delta('suiveur_emails_envoyes')})
  Taux reponse : ${today.suiveur_reply_rate}% (${delta('suiveur_reply_rate')})
  Reponses positives : ${today.suiveur_reponses_positives} (${delta('suiveur_reponses_positives')})

SCORING :
  HOT: ${today.scoreur_nb_hot} | WARM: ${today.scoreur_nb_warm} | COLD: ${today.scoreur_nb_cold} | DISQ: ${today.scoreur_nb_disqualifie}
  Score moyen : ${today.scoreur_score_moyen}

NURTURE :
  Total en nurture : ${today.nurtureur_total_en_nurture}
  Reclassifies HOT : ${today.nurtureur_reclassifies_hot}

BUSINESS :
  Deals gagnes : ${today.pipeline_deals_gagnes}
  Revenu du jour : ${today.pipeline_revenu_jour} EUR
  Pipeline total : ${today.pipeline_valeur_totale} EUR

COUTS : ${today.cout_total_jour_eur} EUR
${'='.repeat(50)}
  `.trim()

  // Envoyer via Slack
  await slack.chat.postMessage({
    channel: '#pipeline-metrics',
    text: digestText,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Digest ${snapshotDate} | ${healthStatus === 'VERT' ? 'Vert' : healthStatus === 'JAUNE' ? 'Jaune' : 'Rouge'}` }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Leads detectes*\n${today.veilleur_leads_bruts}` },
          { type: 'mrkdwn', text: `*Emails envoyes*\n${today.suiveur_emails_envoyes}` },
          { type: 'mrkdwn', text: `*Taux reponse*\n${today.suiveur_reply_rate}%` },
          { type: 'mrkdwn', text: `*Reponses positives*\n${today.suiveur_reponses_positives}` },
          { type: 'mrkdwn', text: `*Deals gagnes*\n${today.pipeline_deals_gagnes}` },
          { type: 'mrkdwn', text: `*Revenu*\n${today.pipeline_revenu_jour} EUR` },
        ]
      },
    ]
  })

  // Envoyer par email
  await sendEmail({
    to: 'jonathan@axiom-marketing.fr',
    subject: `[Axiom] Digest ${snapshotDate} | ${healthStatus}`,
    body: digestText,
  })

  return digestText
}

// === RAPPORT HEBDOMADAIRE (Lundi 9h) ===

export async function generateWeeklyReport(): Promise<string> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  // Charger les 7 derniers jours + 7 jours precedents (pour comparaison)
  const result = await pool.query(`
    SELECT *
    FROM metriques_daily
    WHERE date_snapshot >= ($1::date - 7) AND date_snapshot <= $2
    ORDER BY date_snapshot ASC
  `, [startDate, endDate])

  const thisWeek = result.rows.filter(r => r.date_snapshot >= startDate)
  const lastWeek = result.rows.filter(r => r.date_snapshot < startDate)

  // Aggreger par semaine
  const sumField = (rows: any[], field: string): number =>
    rows.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0)

  const avgField = (rows: any[], field: string): number => {
    const vals = rows.map(r => parseFloat(r[field]) || 0)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }

  // Generer les donnees structurees
  const weekData = {
    leads: sumField(thisWeek, 'veilleur_leads_bruts'),
    leads_prev: sumField(lastWeek, 'veilleur_leads_bruts'),
    qualifies: sumField(thisWeek, 'veilleur_leads_qualifies'),
    emails: sumField(thisWeek, 'suiveur_emails_envoyes'),
    reply_rate: avgField(thisWeek, 'suiveur_reply_rate'),
    reply_rate_prev: avgField(lastWeek, 'suiveur_reply_rate'),
    positive_replies: sumField(thisWeek, 'suiveur_reponses_positives'),
    deals: sumField(thisWeek, 'pipeline_deals_gagnes'),
    revenue: sumField(thisWeek, 'pipeline_revenu_jour'),
    pipeline: thisWeek.length > 0 ? thisWeek[thisWeek.length - 1].pipeline_valeur_totale : 0,
    hot: sumField(thisWeek, 'scoreur_nb_hot'),
    warm: sumField(thisWeek, 'scoreur_nb_warm'),
    cold: sumField(thisWeek, 'scoreur_nb_cold'),
    nurture_total: thisWeek.length > 0 ? thisWeek[thisWeek.length - 1].nurtureur_total_en_nurture : 0,
    reclassifies: sumField(thisWeek, 'nurtureur_reclassifies_hot'),
    costs: sumField(thisWeek, 'cout_total_jour_eur'),
    bounces: sumField(thisWeek, 'suiveur_emails_bounced'),
    bounce_rate: avgField(thisWeek, 'suiveur_bounce_rate'),
    optouts: sumField(thisWeek, 'suiveur_opt_outs') + sumField(thisWeek, 'nurtureur_opt_outs'),
  }

  // Appeler Claude API pour generer le resume avec recommandations
  const claudeResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `Tu es l'Agent 7 ANALYSTE du systeme de prospection Axiom Marketing.
Tu generes un rapport hebdomadaire pour Jonathan, le fondateur.
Ton ton est direct, factuel, actionnable. Pas de formalites excessives.
Tu identifies les 2-3 points cles et fais des recommandations concretes.
Tu compares systematiquement a la semaine precedente et aux objectifs.
Objectifs Phase 1 : reply rate >= 5%, bounce rate < 2%, 2-4 deals/semaine, 10K-20K EUR/semaine.`,
    messages: [{
      role: 'user',
      content: `Voici les donnees de la semaine ${startDate} -> ${endDate} :
${JSON.stringify(weekData, null, 2)}

Genere un rapport hebdomadaire structure avec :
1. Resume executif (3 lignes max)
2. Funnel de la semaine (leads -> qualifies -> contactes -> reponses -> deals)
3. Performance templates (si des donnees A/B sont disponibles)
4. Performance par segment
5. Top 3 recommandations (une par agent si possible)
6. Prevision semaine prochaine`
    }]
  })

  const claudeSummary = claudeResponse.content[0].type === 'text'
    ? claudeResponse.content[0].text
    : ''

  // Construire le rapport complet
  const reportText = `
${'='.repeat(60)}
AXIOM MARKETING -- RAPPORT HEBDOMADAIRE
Semaine du ${startDate} au ${endDate}
Agent 7 ANALYSTE
${'='.repeat(60)}

METRIQUES CLES
${'─'.repeat(60)}
Metrique                   Semaine   Sem. prec.  Objectif   Statut
${'─'.repeat(60)}
Leads detectes             ${weekData.leads.toString().padEnd(10)} ${weekData.leads_prev.toString().padEnd(12)} 80-120     ${weekData.leads >= 80 ? 'OK' : 'BAS'}
Leads qualifies            ${weekData.qualifies.toString().padEnd(10)} -            20-40      ${weekData.qualifies >= 20 ? 'OK' : 'BAS'}
Emails envoyes             ${weekData.emails.toString().padEnd(10)} -            50-100     ${weekData.emails >= 50 ? 'OK' : 'BAS'}
Taux reponse               ${weekData.reply_rate.toFixed(1)}%      ${weekData.reply_rate_prev.toFixed(1)}%        >= 5%      ${weekData.reply_rate >= 5 ? 'OK' : 'BAS'}
Reponses positives         ${weekData.positive_replies.toString().padEnd(10)} -            5-15       ${weekData.positive_replies >= 5 ? 'OK' : 'BAS'}
Deals gagnes               ${weekData.deals.toString().padEnd(10)} -            2-4        ${weekData.deals >= 2 ? 'OK' : 'BAS'}
Revenu                     ${weekData.revenue.toFixed(0)} EUR   -            10-20K     ${weekData.revenue >= 10000 ? 'OK' : 'BAS'}
Pipeline total             ${weekData.pipeline} EUR
Bounce rate                ${weekData.bounce_rate.toFixed(1)}%      -            < 2%       ${weekData.bounce_rate < 2 ? 'OK' : 'HAUT'}
Opt-outs                   ${weekData.optouts.toString().padEnd(10)} -            < 3        ${weekData.optouts < 3 ? 'OK' : 'HAUT'}
Couts totaux               ${weekData.costs.toFixed(0)} EUR    -            -          -

DISTRIBUTION SCORING
${'─'.repeat(60)}
HOT: ${weekData.hot} | WARM: ${weekData.warm} | COLD: ${weekData.cold}

NURTURE
${'─'.repeat(60)}
Total en nurture : ${weekData.nurture_total}
Reclassifies HOT cette semaine : ${weekData.reclassifies}

ANALYSE ET RECOMMANDATIONS (Claude API)
${'─'.repeat(60)}
${claudeSummary}

${'='.repeat(60)}
Genere automatiquement par Agent 7 ANALYSTE v1.0
  `.trim()

  // Envoyer Slack + Email
  await slack.chat.postMessage({
    channel: '#pipeline-metrics',
    text: reportText,
  })

  await sendEmail({
    to: 'jonathan@axiom-marketing.fr',
    subject: `[Axiom] Rapport Hebdo ${startDate} -> ${endDate}`,
    body: reportText,
  })

  return reportText
}

// === RAPPORT MENSUEL (1er du mois) ===

export async function generateMonthlyReport(): Promise<string> {
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const startDate = lastMonth.toISOString().split('T')[0]
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]

  // Charger toutes les metriques du mois
  const result = await pool.query(`
    SELECT * FROM metriques_daily
    WHERE date_snapshot >= $1 AND date_snapshot <= $2
    ORDER BY date_snapshot ASC
  `, [startDate, endDate])

  const rows = result.rows

  // Charger les outcomes pour l'analyse de precision du scoring
  const outcomes = await pool.query(`
    SELECT
      po.score_at_contact,
      po.categorie_at_contact,
      po.segment,
      po.outcome,
      po.montant_deal,
      po.cycle_vente_jours,
      po.canal_conversion
    FROM prospect_outcomes po
    WHERE po.date_outcome >= $1 AND po.date_outcome <= $2
  `, [startDate, endDate])

  // Charger les donnees A/B test
  const abTests = await pool.query(`
    SELECT
      template_id,
      ab_variant,
      COUNT(*) as envois,
      COUNT(*) FILTER (WHERE reply_received = true) as reponses,
      ROUND(COUNT(*) FILTER (WHERE reply_received = true)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as reply_rate
    FROM email_sends es
    WHERE DATE(sent_at) >= $1 AND DATE(sent_at) <= $2
      AND ab_variant IS NOT NULL
    GROUP BY template_id, ab_variant
    ORDER BY template_id, ab_variant
  `, [startDate, endDate])

  // Calculer la precision du scoring
  const scoringPrecision = calculateScoringPrecision(outcomes.rows)

  // Appeler Claude API pour le rapport strategique complet
  const monthData = {
    period: `${startDate} -> ${endDate}`,
    days: rows.length,
    totals: {
      leads: rows.reduce((a, r) => a + (parseInt(r.veilleur_leads_bruts) || 0), 0),
      qualifies: rows.reduce((a, r) => a + (parseInt(r.veilleur_leads_qualifies) || 0), 0),
      emails: rows.reduce((a, r) => a + (parseInt(r.suiveur_emails_envoyes) || 0), 0),
      replies: rows.reduce((a, r) => a + (parseInt(r.suiveur_reponses_total) || 0), 0),
      positive_replies: rows.reduce((a, r) => a + (parseInt(r.suiveur_reponses_positives) || 0), 0),
      deals: rows.reduce((a, r) => a + (parseInt(r.pipeline_deals_gagnes) || 0), 0),
      revenue: rows.reduce((a, r) => a + (parseFloat(r.pipeline_revenu_jour) || 0), 0),
      costs: rows.reduce((a, r) => a + (parseFloat(r.cout_total_jour_eur) || 0), 0),
    },
    averages: {
      reply_rate: rows.reduce((a, r) => a + (parseFloat(r.suiveur_reply_rate) || 0), 0) / Math.max(rows.length, 1),
      bounce_rate: rows.reduce((a, r) => a + (parseFloat(r.suiveur_bounce_rate) || 0), 0) / Math.max(rows.length, 1),
      score_moyen: rows.reduce((a, r) => a + (parseFloat(r.scoreur_score_moyen) || 0), 0) / Math.max(rows.length, 1),
    },
    scoring_precision: scoringPrecision,
    ab_tests: abTests.rows,
    outcomes_summary: summarizeOutcomes(outcomes.rows),
  }

  const claudeResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: `Tu es l'Agent 7 ANALYSTE. Tu generes un rapport mensuel strategique pour Jonathan.
Ce rapport est STRATEGIQUE : ROI, tendances, calibration scoring, forecasting.
Tu es direct, precis, et tu donnes des actions concretes.
Le rapport fait ~3 pages. Chaque section doit etre actionnable.
Objectifs Phase 1 Axiom : 5-10 deals/mois, 50K-100K EUR/mois, reply rate 5%+, CAC < 500 EUR.`,
    messages: [{
      role: 'user',
      content: `Donnees du mois :
${JSON.stringify(monthData, null, 2)}

Genere un rapport mensuel strategique avec :
1. Resume executif (5 lignes)
2. ROI du mois (revenu vs couts, CAC, LTV:CAC estime)
3. Analyse du funnel complet (leads -> deals, taux chaque etape)
4. Precision du scoring (faux positifs, faux negatifs, recommandations poids)
5. Performance templates et A/B tests (gagnants, perdants, recommandations)
6. Performance par segment (quel segment convertit le mieux)
7. Attribution (quel canal contribue le plus au revenu)
8. Forecasting 30/60/90 jours
9. Top 5 recommandations prioritaires (une par agent concerne)
10. Risques et points d'attention`
    }]
  })

  const claudeStrategic = claudeResponse.content[0].type === 'text'
    ? claudeResponse.content[0].text
    : ''

  const monthlyReport = `
${'='.repeat(60)}
AXIOM MARKETING -- RAPPORT MENSUEL STRATEGIQUE
${startDate} -> ${endDate}
Agent 7 ANALYSTE v1.0
${'='.repeat(60)}

${claudeStrategic}

${'='.repeat(60)}
ANNEXE : DONNEES BRUTES DU MOIS
${'─'.repeat(60)}
Total leads detectes : ${monthData.totals.leads}
Total emails envoyes : ${monthData.totals.emails}
Total reponses : ${monthData.totals.replies}
Taux reponse moyen : ${monthData.averages.reply_rate.toFixed(1)}%
Total deals : ${monthData.totals.deals}
Revenu total : ${monthData.totals.revenue.toFixed(0)} EUR
Couts totaux : ${monthData.totals.costs.toFixed(0)} EUR
ROI brut : ${monthData.totals.costs > 0 ? ((monthData.totals.revenue / monthData.totals.costs) * 100).toFixed(0) : 'N/A'}%

PRECISION SCORING :
  Precision HOT : ${scoringPrecision.precision_hot.toFixed(1)}%
  Recall : ${scoringPrecision.recall.toFixed(1)}%
  Faux positifs HOT : ${scoringPrecision.faux_positifs_hot.toFixed(1)}%
  Score moyen des deals : ${scoringPrecision.score_moyen_deals.toFixed(0)}
${'='.repeat(60)}
  `.trim()

  await slack.chat.postMessage({
    channel: '#pipeline-metrics',
    text: monthlyReport,
  })

  await sendEmail({
    to: 'jonathan@axiom-marketing.fr',
    subject: `[Axiom] Rapport Mensuel ${startDate}`,
    body: monthlyReport,
  })

  return monthlyReport
}

// === FONCTIONS UTILITAIRES ===

function calculateScoringPrecision(outcomes: any[]): {
  precision_hot: number
  recall: number
  faux_positifs_hot: number
  faux_negatifs: number
  score_moyen_deals: number
} {
  const hotOutcomes = outcomes.filter(o => o.categorie_at_contact === 'HOT')
  const convertis = outcomes.filter(o => o.outcome === 'converti')
  const hotConvertis = hotOutcomes.filter(o => o.outcome === 'converti' || o.outcome === 'opportunite')
  const hotSansReponse = hotOutcomes.filter(o => o.outcome === 'pas_de_reponse')
  const fauxNegatifs = convertis.filter(o => o.categorie_at_contact === 'COLD' || o.categorie_at_contact === 'DISQUALIFIE')

  return {
    precision_hot: hotOutcomes.length > 0
      ? (hotConvertis.length / hotOutcomes.length) * 100
      : 0,
    recall: convertis.length > 0
      ? (convertis.filter(o => o.categorie_at_contact === 'HOT').length / convertis.length) * 100
      : 0,
    faux_positifs_hot: hotOutcomes.length > 0
      ? (hotSansReponse.length / hotOutcomes.length) * 100
      : 0,
    faux_negatifs: convertis.length > 0
      ? (fauxNegatifs.length / convertis.length) * 100
      : 0,
    score_moyen_deals: convertis.length > 0
      ? convertis.reduce((a, c) => a + c.score_at_contact, 0) / convertis.length
      : 0,
  }
}

function summarizeOutcomes(outcomes: any[]): Record<string, number> {
  const summary: Record<string, number> = {}
  outcomes.forEach(o => {
    summary[o.outcome] = (summary[o.outcome] || 0) + 1
  })
  return summary
}

async function sendEmail(params: { to: string, subject: string, body: string }): Promise<void> {
  // Implementation via Gmail API (identique Agent 5)
  const { google } = await import('googleapis')
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  })
  const gmail = google.gmail({ version: 'v1', auth })

  const raw = Buffer.from(
    `To: ${params.to}\r\n` +
    `Subject: ${params.subject}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
    params.body
  ).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })
}
```

---

### 3.5 Sous-Agent 7c -- Detecteur d'Anomalies

#### Mission

Detecter en temps reel (ou quasi-temps-reel via cron toutes les heures) les anomalies dans les metriques du pipeline. Utilise des z-scores sur des moving averages de 7 jours, des seuils fixes, et des alertes Slack immediates.

#### Seuils de detection

| Metrique | Normal | WARNING (1.5 sigma) | CRITICAL (2.5 sigma) | Seuil fixe CRITICAL |
|---|---|---|---|---|
| Reply rate quotidien | 4-7% | < 3% ou > 9% | < 2% ou > 11% | < 1% |
| Bounce rate quotidien | 0.5-2% | > 3% | > 5% | > 5% |
| Leads detectes / jour | 30-80 | < 15 ou > 120 | < 5 ou > 200 | 0 (systeme down) |
| Emails envoyes / jour | 10-50 | < 5 ou > 80 | 0 ou > 100 | 0 (systeme down) |
| Opt-out rate / jour | 0-0.3% | > 0.5% | > 1% | > 2% |
| Score moyen | 40-55 | < 30 ou > 65 | < 20 ou > 75 | - |
| Distribution HOT | 8-15% | > 25% ou < 3% | > 40% ou < 1% | - |
| Taux enrichissement | 70-90% | < 60% | < 40% | < 20% |
| SLA breaches / jour | 0-1 | 2-3 | > 5 | > 10 |
| Nurture engagement moyen | 20-50 | < 10 | < 5 | - |

#### Code TypeScript : Detecteur d'Anomalies

```typescript
// sous-agents/7c-detecteur.ts
import { Pool } from 'pg'
import { WebClient } from '@slack/web-api'

const pool = new Pool({ /* config */ })
const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

interface Anomaly {
  metrique: string
  valeur_actuelle: number
  moyenne_7j: number
  ecart_type: number
  z_score: number
  seuil_type: 'WARNING' | 'CRITICAL'
  message: string
}

// Table des alertes
// CREATE TABLE IF NOT EXISTS alertes (
//   id SERIAL PRIMARY KEY,
//   date_detection TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
//   metrique VARCHAR(100) NOT NULL,
//   valeur_actuelle NUMERIC NOT NULL,
//   moyenne_7j NUMERIC NOT NULL,
//   z_score NUMERIC,
//   seuil_type VARCHAR(20) NOT NULL CHECK (seuil_type IN ('WARNING', 'CRITICAL')),
//   message TEXT NOT NULL,
//   acknowledged BOOLEAN DEFAULT false,
//   acknowledged_by VARCHAR(100),
//   acknowledged_at TIMESTAMP WITH TIME ZONE,
//   resolved BOOLEAN DEFAULT false,
//   resolved_at TIMESTAMP WITH TIME ZONE
// );
// CREATE INDEX idx_alertes_date ON alertes(date_detection DESC);
// CREATE INDEX idx_alertes_resolved ON alertes(resolved) WHERE resolved = false;

export async function detectAnomalies(date?: string): Promise<Anomaly[]> {
  const snapshotDate = date || new Date().toISOString().split('T')[0]
  const anomalies: Anomaly[] = []

  // Charger les 8 derniers jours (1 jour courant + 7 jours pour le calcul)
  const result = await pool.query(`
    SELECT *
    FROM metriques_daily
    WHERE date_snapshot >= ($1::date - 7) AND date_snapshot <= $1
    ORDER BY date_snapshot ASC
  `, [snapshotDate])

  if (result.rows.length < 2) {
    console.log('[7c] Pas assez de donnees pour la detection (< 2 jours)')
    return []
  }

  const today = result.rows[result.rows.length - 1]
  const history = result.rows.slice(0, -1) // Les 7 jours precedents

  // Liste des metriques a surveiller avec leurs seuils
  const metricsToMonitor = [
    {
      name: 'suiveur_reply_rate',
      label: 'Taux de reponse',
      warningLow: 3, criticalLow: 2,
      warningHigh: 9, criticalHigh: 11,
      fixedCriticalLow: 1,
    },
    {
      name: 'suiveur_bounce_rate',
      label: 'Taux de bounce',
      warningHigh: 3, criticalHigh: 5,
      fixedCriticalHigh: 5,
    },
    {
      name: 'veilleur_leads_bruts',
      label: 'Leads detectes',
      warningLow: 15, criticalLow: 5,
      warningHigh: 120, criticalHigh: 200,
      fixedCriticalLow: 0,
    },
    {
      name: 'suiveur_emails_envoyes',
      label: 'Emails envoyes',
      warningLow: 5, criticalLow: 0,
      warningHigh: 80, criticalHigh: 100,
      fixedCriticalLow: 0,
    },
    {
      name: 'enrichisseur_taux_enrichissement',
      label: 'Taux enrichissement',
      warningLow: 60, criticalLow: 40,
    },
    {
      name: 'suiveur_sla_breaches',
      label: 'SLA breaches',
      warningHigh: 3, criticalHigh: 5,
      fixedCriticalHigh: 10,
    },
    {
      name: 'scoreur_pct_hot',
      label: 'Distribution HOT',
      warningLow: 3, criticalLow: 1,
      warningHigh: 25, criticalHigh: 40,
    },
  ]

  for (const metric of metricsToMonitor) {
    const currentValue = parseFloat(today[metric.name]) || 0
    const historicalValues = history.map(h => parseFloat(h[metric.name]) || 0)
    const mean = historicalValues.reduce((a, b) => a + b, 0) / Math.max(historicalValues.length, 1)
    const stddev = Math.sqrt(
      historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / Math.max(historicalValues.length, 1)
    )
    const zScore = stddev > 0 ? (currentValue - mean) / stddev : 0

    // Verifier seuils fixes d'abord (plus urgent)
    if (metric.fixedCriticalLow !== undefined && currentValue <= metric.fixedCriticalLow) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique fixe: ${metric.fixedCriticalLow}). SYSTEME POTENTIELLEMENT EN PANNE.`,
      })
      continue
    }

    if (metric.fixedCriticalHigh !== undefined && currentValue >= metric.fixedCriticalHigh) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique fixe: ${metric.fixedCriticalHigh}). ANOMALIE MAJEURE.`,
      })
      continue
    }

    // Verifier z-score (anomalies statistiques)
    if (Math.abs(zScore) > 2.5) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (moyenne 7j: ${mean.toFixed(1)}, z-score: ${zScore.toFixed(1)}). Ecart > 2.5 sigma.`,
      })
    } else if (Math.abs(zScore) > 1.5) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'WARNING',
        message: `${metric.label} = ${currentValue} (moyenne 7j: ${mean.toFixed(1)}, z-score: ${zScore.toFixed(1)}). Ecart > 1.5 sigma.`,
      })
    }

    // Verifier seuils fixes WARNING/CRITICAL
    if (metric.criticalLow !== undefined && currentValue < metric.criticalLow) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique bas: ${metric.criticalLow}).`,
      })
    } else if (metric.warningLow !== undefined && currentValue < metric.warningLow) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'WARNING',
        message: `${metric.label} = ${currentValue} (seuil warning bas: ${metric.warningLow}).`,
      })
    }

    if (metric.criticalHigh !== undefined && currentValue > metric.criticalHigh) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique haut: ${metric.criticalHigh}).`,
      })
    } else if (metric.warningHigh !== undefined && currentValue > metric.warningHigh) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'WARNING',
        message: `${metric.label} = ${currentValue} (seuil warning haut: ${metric.warningHigh}).`,
      })
    }
  }

  // Persister les anomalies
  for (const anomaly of anomalies) {
    await pool.query(`
      INSERT INTO alertes (metrique, valeur_actuelle, moyenne_7j, z_score, seuil_type, message)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [anomaly.metrique, anomaly.valeur_actuelle, anomaly.moyenne_7j, anomaly.z_score, anomaly.seuil_type, anomaly.message])
  }

  // Envoyer les alertes Slack
  if (anomalies.length > 0) {
    await sendAnomalySlackAlert(anomalies, snapshotDate)
  }

  console.log(`[7c] Detection terminee: ${anomalies.length} anomalies (${anomalies.filter(a => a.seuil_type === 'CRITICAL').length} critiques)`)
  return anomalies
}

async function sendAnomalySlackAlert(anomalies: Anomaly[], date: string): Promise<void> {
  const criticals = anomalies.filter(a => a.seuil_type === 'CRITICAL')
  const warnings = anomalies.filter(a => a.seuil_type === 'WARNING')

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: criticals.length > 0
          ? `ALERTE CRITIQUE -- ${date}`
          : `Attention -- ${date}`,
      }
    },
  ]

  if (criticals.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*ANOMALIES CRITIQUES (${criticals.length}) :*\n` +
          criticals.map(a =>
            `> *${a.metrique}* : ${a.valeur_actuelle} (moy. 7j: ${a.moyenne_7j.toFixed(1)}, z: ${a.z_score.toFixed(1)})\n> ${a.message}`
          ).join('\n\n'),
      }
    })
  }

  if (warnings.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Warnings (${warnings.length}) :*\n` +
          warnings.map(a =>
            `> ${a.metrique} : ${a.valeur_actuelle} (moy. 7j: ${a.moyenne_7j.toFixed(1)})`
          ).join('\n'),
      }
    })
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Voir le dashboard' },
        url: `${process.env.METABASE_URL}/dashboard/1`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Acknowledger' },
        action_id: 'acknowledge_alert',
        value: date,
        style: 'primary',
      },
    ]
  })

  await slack.chat.postMessage({
    channel: criticals.length > 0 ? '#alerts-critical' : '#pipeline-metrics',
    text: `${criticals.length > 0 ? 'ALERTE CRITIQUE' : 'Warning'} pipeline ${date}`,
    blocks,
  })

  // Si CRITICAL, aussi DM a Jonathan
  if (criticals.length > 0) {
    await slack.chat.postMessage({
      channel: process.env.JONATHAN_SLACK_ID || '@jonathan',
      text: `ALERTE CRITIQUE pipeline ${date} :\n${criticals.map(a => `- ${a.message}`).join('\n')}`,
    })
  }
}
```

#### Table SQL : alertes

```sql
CREATE TABLE IF NOT EXISTS alertes (
  id SERIAL PRIMARY KEY,
  date_detection TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metrique VARCHAR(100) NOT NULL,
  valeur_actuelle NUMERIC NOT NULL,
  moyenne_7j NUMERIC NOT NULL,
  z_score NUMERIC,
  seuil_type VARCHAR(20) NOT NULL CHECK (seuil_type IN ('WARNING', 'CRITICAL')),
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by VARCHAR(100),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_alertes_date ON alertes(date_detection DESC);
CREATE INDEX idx_alertes_resolved ON alertes(resolved) WHERE resolved = false;
CREATE INDEX idx_alertes_seuil ON alertes(seuil_type);
```

---

### 3.6 Sous-Agent 7d -- Recommandeur

#### Mission

Analyser les donnees collectees par 7a, les anomalies detectees par 7c, et generer des recommandations concretes et actionnables pour chaque agent du pipeline. Utilise Claude API pour analyser les patterns et proposer des actions.

#### Table SQL : recommandations

```sql
CREATE TABLE IF NOT EXISTS recommandations (
  id SERIAL PRIMARY KEY,
  date_generation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  agent_cible VARCHAR(30) NOT NULL,
    -- 'agent_1_veilleur', 'agent_3_scoreur', 'agent_4_redacteur',
    -- 'agent_5_suiveur', 'agent_6_nurtureur', 'global'
  type_recommandation VARCHAR(50) NOT NULL,
    -- 'ajuster_poids', 'desactiver_template', 'ajouter_mot_cle',
    -- 'ajuster_sequence', 'ajuster_frequence', 'ajuster_source',
    -- 'ajuster_sunset', 'recalibrer_scoring'
  priorite VARCHAR(10) NOT NULL CHECK (priorite IN ('HAUTE', 'MOYENNE', 'BASSE')),
  titre VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  action_concrete TEXT NOT NULL,       -- L'action exacte a effectuer
  impact_estime TEXT,                  -- Ex: "+2% reply rate", "-500 EUR/mois"
  donnees_support JSONB,               -- Donnees qui justifient la recommandation
  statut VARCHAR(20) DEFAULT 'PENDING'
    CHECK (statut IN ('PENDING', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'EXPIRED')),
  approved_by VARCHAR(100),
  approved_at TIMESTAMP WITH TIME ZONE,
  implemented_at TIMESTAMP WITH TIME ZONE,
  result_after_implementation JSONB,   -- Metriques apres implementation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recommandations_agent ON recommandations(agent_cible);
CREATE INDEX idx_recommandations_statut ON recommandations(statut);
CREATE INDEX idx_recommandations_priorite ON recommandations(priorite);
CREATE INDEX idx_recommandations_date ON recommandations(date_generation DESC);
```

#### Code TypeScript : Recommandeur

```typescript
// sous-agents/7d-recommandeur.ts
import Anthropic from '@anthropic-ai/sdk'
import { Pool } from 'pg'
import { WebClient } from '@slack/web-api'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const pool = new Pool({ /* config */ })
const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

interface Recommendation {
  agent_cible: string
  type_recommandation: string
  priorite: 'HAUTE' | 'MOYENNE' | 'BASSE'
  titre: string
  description: string
  action_concrete: string
  impact_estime: string
  donnees_support: Record<string, any>
}

export async function generateRecommendations(): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = []

  // 1. Analyser les templates (pour Agent 4 REDACTEUR)
  const templatePerf = await pool.query(`
    SELECT
      es.template_id,
      COUNT(*) as envois,
      COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as positives,
      ROUND(
        COUNT(*) FILTER (WHERE rc.category IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 2
      ) as reply_rate
    FROM email_sends es
    LEFT JOIN reply_classifications rc ON rc.prospect_id = es.prospect_id
    WHERE es.sent_at >= NOW() - INTERVAL '14 days'
    GROUP BY es.template_id
    HAVING COUNT(*) >= 20
    ORDER BY reply_rate ASC
  `)

  for (const template of templatePerf.rows) {
    if (parseFloat(template.reply_rate) < 3.0 && parseInt(template.envois) >= 50) {
      recommendations.push({
        agent_cible: 'agent_4_redacteur',
        type_recommandation: 'desactiver_template',
        priorite: 'HAUTE',
        titre: `Desactiver template ${template.template_id} (reply rate < 3%)`,
        description: `Le template ${template.template_id} a un taux de reponse de ${template.reply_rate}% sur ${template.envois} envois (14 derniers jours). C'est en dessous du seuil minimum de 3%.`,
        action_concrete: `Mettre template_status = 'paused' pour template_id = '${template.template_id}'. Creer une nouvelle variante pour A/B test.`,
        impact_estime: '+1-2% reply rate global si remplace par un template performant',
        donnees_support: {
          template_id: template.template_id,
          envois: template.envois,
          reply_rate: template.reply_rate,
          positives: template.positives,
        },
      })
    }
  }

  // 2. Analyser la precision du scoring (pour Agent 3 SCOREUR)
  const scoringAnalysis = await pool.query(`
    SELECT
      po.categorie_at_contact,
      po.outcome,
      COUNT(*) as count,
      AVG(po.score_at_contact) as avg_score
    FROM prospect_outcomes po
    WHERE po.date_outcome >= NOW() - INTERVAL '30 days'
    GROUP BY po.categorie_at_contact, po.outcome
    ORDER BY po.categorie_at_contact, po.outcome
  `)

  const hotTotal = scoringAnalysis.rows.filter(r => r.categorie_at_contact === 'HOT')
  const hotConvertis = hotTotal.filter(r => r.outcome === 'converti' || r.outcome === 'opportunite')
  const hotSansReponse = hotTotal.filter(r => r.outcome === 'pas_de_reponse')

  const hotTotalCount = hotTotal.reduce((a, r) => a + parseInt(r.count), 0)
  const hotConvertiCount = hotConvertis.reduce((a, r) => a + parseInt(r.count), 0)
  const hotSansReponseCount = hotSansReponse.reduce((a, r) => a + parseInt(r.count), 0)

  if (hotTotalCount > 10 && hotConvertiCount / hotTotalCount < 0.30) {
    recommendations.push({
      agent_cible: 'agent_3_scoreur',
      type_recommandation: 'recalibrer_scoring',
      priorite: 'HAUTE',
      titre: `Precision HOT insuffisante (${((hotConvertiCount / hotTotalCount) * 100).toFixed(0)}% < 30%)`,
      description: `Sur ${hotTotalCount} prospects HOT contactes, seulement ${hotConvertiCount} ont converti ou sont en opportunite. Le scoring est trop genereux.`,
      action_concrete: `Augmenter le seuil HOT de 75 a 80. Augmenter le poids de l'axe Signaux (30→35 pts). Reduire le poids de l'axe Engagement (15→10 pts).`,
      impact_estime: 'Precision HOT de 30% -> 40%, moins de faux positifs',
      donnees_support: {
        hot_total: hotTotalCount,
        hot_convertis: hotConvertiCount,
        hot_sans_reponse: hotSansReponseCount,
        precision_actuelle: ((hotConvertiCount / hotTotalCount) * 100).toFixed(1),
      },
    })
  }

  // 3. Analyser les sources (pour Agent 1 VEILLEUR)
  const sourcePerf = await pool.query(`
    SELECT
      lb.source_primaire,
      COUNT(*) as leads_total,
      COUNT(DISTINCT CASE WHEN po.outcome = 'converti' THEN po.prospect_id END) as convertis,
      COALESCE(SUM(po.montant_deal) FILTER (WHERE po.outcome = 'converti'), 0) as revenu
    FROM leads_bruts lb
    LEFT JOIN prospects p ON p.lead_id = lb.lead_id
    LEFT JOIN prospect_outcomes po ON po.prospect_id = p.prospect_id
    WHERE lb.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY lb.source_primaire
    ORDER BY revenu DESC
  `)

  for (const source of sourcePerf.rows) {
    const leadsTotal = parseInt(source.leads_total) || 0
    const convertis = parseInt(source.convertis) || 0

    if (leadsTotal > 50 && convertis === 0) {
      recommendations.push({
        agent_cible: 'agent_1_veilleur',
        type_recommandation: 'ajuster_source',
        priorite: 'MOYENNE',
        titre: `Source ${source.source_primaire} sans conversion (${leadsTotal} leads, 0 deals)`,
        description: `La source ${source.source_primaire} genere ${leadsTotal} leads/mois mais 0 conversion. Verifier la qualite des leads ou ajuster les criteres de detection.`,
        action_concrete: `Revoir les mots-cles et criteres de detection pour ${source.source_primaire}. Si apres 30 jours supplementaires toujours 0 conversion, reduire la priorite de cette source.`,
        impact_estime: 'Focaliser les ressources sur les sources qui convertissent',
        donnees_support: {
          source: source.source_primaire,
          leads_30j: leadsTotal,
          convertis: convertis,
          revenu: source.revenu,
        },
      })
    }
  }

  // 4. Analyser les sequences (pour Agent 5 SUIVEUR)
  const sequencePerf = await pool.query(`
    SELECT
      ps.current_step,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as reponses_positives
    FROM prospect_sequences ps
    LEFT JOIN reply_classifications rc ON rc.prospect_id = ps.prospect_id
    WHERE ps.updated_at >= NOW() - INTERVAL '30 days'
    GROUP BY ps.current_step
    ORDER BY ps.current_step
  `)

  // Detecter si les reponses sont concentrees sur les premieres etapes
  const step1Replies = sequencePerf.rows.find(r => r.current_step === 1)
  const laterReplies = sequencePerf.rows.filter(r => r.current_step > 3)
  const laterReplyTotal = laterReplies.reduce((a, r) => a + parseInt(r.reponses_positives || 0), 0)

  if (step1Replies && laterReplyTotal === 0 && sequencePerf.rows.length > 3) {
    recommendations.push({
      agent_cible: 'agent_5_suiveur',
      type_recommandation: 'ajuster_sequence',
      priorite: 'MOYENNE',
      titre: 'Sequences trop longues -- aucune reponse apres etape 3',
      description: `Toutes les reponses positives viennent des etapes 1-3. Les etapes 4+ ne generent rien. Raccourcir les sequences economisera des envois et reduira la fatigue.`,
      action_concrete: `Reduire les sequences WARM de 6 a 4 etapes. Garder les sequences HOT a 5 etapes. Tester sur 30 jours.`,
      impact_estime: 'Reduction opt-outs, meme conversion avec moins d\'emails',
      donnees_support: { sequence_stats: sequencePerf.rows },
    })
  }

  // 5. Analyser le nurturing (pour Agent 6 NURTUREUR)
  const nurturePerf = await pool.query(`
    SELECT
      segment,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE nurture_status = 'RECLASSIFIED_HOT') as reclassifies,
      COUNT(*) FILTER (WHERE nurture_status = 'SUNSET') as sunsets,
      AVG(engagement_score_current) as engagement_moyen
    FROM nurture_prospects
    WHERE created_at >= NOW() - INTERVAL '90 days'
    GROUP BY segment
    ORDER BY reclassifies DESC
  `)

  for (const segment of nurturePerf.rows) {
    const total = parseInt(segment.total) || 0
    const sunsets = parseInt(segment.sunsets) || 0
    if (total > 20 && sunsets / total > 0.6) {
      recommendations.push({
        agent_cible: 'agent_6_nurtureur',
        type_recommandation: 'ajuster_sunset',
        priorite: 'BASSE',
        titre: `Taux de sunset trop eleve pour ${segment.segment} (${((sunsets / total) * 100).toFixed(0)}%)`,
        description: `Plus de 60% des prospects nurture du segment ${segment.segment} finissent en sunset. Le contenu ou la frequence ne convient pas.`,
        action_concrete: `Tester une frequence reduite (1 email toutes les 2 semaines au lieu de 1/semaine) et un contenu plus adapte au segment ${segment.segment}.`,
        impact_estime: 'Reduction sunset de 60% a 40%, plus de reclassifications HOT',
        donnees_support: {
          segment: segment.segment,
          total: total,
          sunsets: sunsets,
          reclassifies: segment.reclassifies,
          engagement_moyen: segment.engagement_moyen,
        },
      })
    }
  }

  // 6. Generer un resume Claude API des recommandations
  if (recommendations.length > 0) {
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `Tu es l'Agent 7 ANALYSTE d'Axiom Marketing. Tu presentes les recommandations a Jonathan de maniere concise et priorisee. Ton format : 1 ligne par recommandation, classee par priorite.`,
      messages: [{
        role: 'user',
        content: `Resume ces ${recommendations.length} recommandations pour Jonathan :\n${JSON.stringify(recommendations.map(r => ({
          agent: r.agent_cible,
          priorite: r.priorite,
          titre: r.titre,
          action: r.action_concrete,
          impact: r.impact_estime,
        })), null, 2)}`
      }]
    })

    const summary = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

    // Envoyer sur Slack
    await slack.chat.postMessage({
      channel: '#pipeline-metrics',
      text: `RECOMMANDATIONS HEBDOMADAIRES (${recommendations.length}) :\n\n${summary}`,
    })
  }

  // Persister les recommandations
  for (const rec of recommendations) {
    await pool.query(`
      INSERT INTO recommandations (agent_cible, type_recommandation, priorite, titre, description, action_concrete, impact_estime, donnees_support)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [rec.agent_cible, rec.type_recommandation, rec.priorite, rec.titre, rec.description, rec.action_concrete, rec.impact_estime, JSON.stringify(rec.donnees_support)])
  }

  console.log(`[7d] ${recommendations.length} recommandations generees (${recommendations.filter(r => r.priorite === 'HAUTE').length} haute priorite)`)
  return recommendations
}
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

### 6.4 Calcul de significativite

```typescript
// sous-agents/7d-ab-testing.ts

interface ABTestResult {
  test_id: string
  envois_a: number
  envois_b: number
  replies_a: number
  replies_b: number
  reply_rate_a: number
  reply_rate_b: number
  z_score: number
  p_value: number
  significant: boolean
  gagnant: 'A' | 'B' | 'TIE'
  confiance: number
  recommandation: string
}

export function calculateABTestSignificance(
  envois_a: number,
  replies_a: number,
  envois_b: number,
  replies_b: number,
  min_sample: number = 250
): ABTestResult {

  const rate_a = envois_a > 0 ? replies_a / envois_a : 0
  const rate_b = envois_b > 0 ? replies_b / envois_b : 0

  // Taille d'echantillon suffisante ?
  if (envois_a < min_sample || envois_b < min_sample) {
    return {
      test_id: '',
      envois_a, envois_b, replies_a, replies_b,
      reply_rate_a: rate_a * 100,
      reply_rate_b: rate_b * 100,
      z_score: 0,
      p_value: 1,
      significant: false,
      gagnant: 'TIE',
      confiance: 0,
      recommandation: `Echantillon insuffisant. Besoin de ${min_sample - Math.min(envois_a, envois_b)} envois supplementaires par variante.`,
    }
  }

  // Pooled proportion
  const p_pooled = (replies_a + replies_b) / (envois_a + envois_b)

  // Z-score
  const se = Math.sqrt(p_pooled * (1 - p_pooled) * (1 / envois_a + 1 / envois_b))
  const z = se > 0 ? (rate_b - rate_a) / se : 0

  // P-value (two-tailed) - approximation normale
  const p_value = 2 * (1 - normalCDF(Math.abs(z)))

  const significant = p_value < 0.05
  const gagnant: 'A' | 'B' | 'TIE' = !significant ? 'TIE' : (rate_b > rate_a ? 'B' : 'A')
  const confiance = (1 - p_value) * 100

  let recommandation: string
  if (!significant) {
    recommandation = `Pas de difference significative (p=${p_value.toFixed(3)}). Continuer le test ou conclure egalite.`
  } else if (gagnant === 'B') {
    recommandation = `Variante B gagnante (+${((rate_b - rate_a) * 100).toFixed(1)}pp, p=${p_value.toFixed(3)}). Recommandation : adopter B comme nouveau control, desactiver A.`
  } else {
    recommandation = `Control A reste meilleur (+${((rate_a - rate_b) * 100).toFixed(1)}pp, p=${p_value.toFixed(3)}). Recommandation : desactiver la variante B, garder A.`
  }

  return {
    test_id: '',
    envois_a, envois_b, replies_a, replies_b,
    reply_rate_a: rate_a * 100,
    reply_rate_b: rate_b * 100,
    z_score: z,
    p_value,
    significant,
    gagnant,
    confiance,
    recommandation,
  }
}

// Approximation CDF normale
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327
  const p = d * Math.exp(-x * x / 2) * t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

// Evaluation automatique des tests en cours (cron quotidien)
export async function evaluateRunningABTests(): Promise<void> {
  const tests = await pool.query(`
    SELECT * FROM ab_tests WHERE statut = 'RUNNING'
  `)

  for (const test of tests.rows) {
    // Charger les metriques fraiches
    const metricsA = await pool.query(`
      SELECT
        COUNT(*) as envois,
        COUNT(*) FILTER (WHERE rc.category IS NOT NULL) as replies,
        COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as positive_replies
      FROM email_sends es
      LEFT JOIN reply_classifications rc ON rc.prospect_id = es.prospect_id
      WHERE es.template_id = $1
        AND es.ab_variant = 'A'
        AND es.sent_at >= $2
    `, [test.template_control_id, test.date_debut])

    const metricsB = await pool.query(`
      SELECT
        COUNT(*) as envois,
        COUNT(*) FILTER (WHERE rc.category IS NOT NULL) as replies,
        COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as positive_replies
      FROM email_sends es
      LEFT JOIN reply_classifications rc ON rc.prospect_id = es.prospect_id
      WHERE es.template_id = $1
        AND es.ab_variant = 'B'
        AND es.sent_at >= $2
    `, [test.template_challenger_id, test.date_debut])

    const a = metricsA.rows[0]
    const b = metricsB.rows[0]

    const result = calculateABTestSignificance(
      parseInt(a.envois), parseInt(a.positive_replies),
      parseInt(b.envois), parseInt(b.positive_replies),
      test.taille_min_par_variante
    )

    // Mettre a jour le test
    await pool.query(`
      UPDATE ab_tests SET
        envois_a = $1, envois_b = $2,
        replies_a = $3, replies_b = $4,
        positive_replies_a = $5, positive_replies_b = $6,
        reply_rate_a = $7, reply_rate_b = $8,
        z_score = $9, p_value = $10,
        gagnant = $11, confiance_resultat = $12,
        recommandation = $13
      WHERE test_id = $14
    `, [
      parseInt(a.envois), parseInt(b.envois),
      parseInt(a.replies), parseInt(b.replies),
      parseInt(a.positive_replies), parseInt(b.positive_replies),
      result.reply_rate_a, result.reply_rate_b,
      result.z_score, result.p_value,
      result.gagnant, result.confiance,
      result.recommandation, test.test_id
    ])

    // Si le test est concluant, le cloturer et notifier
    if (result.significant) {
      await pool.query(`
        UPDATE ab_tests SET statut = 'CONCLUDED', date_fin = NOW()
        WHERE test_id = $1
      `, [test.test_id])

      await slack.chat.postMessage({
        channel: '#pipeline-metrics',
        text: `A/B Test "${test.test_name}" CONCLU :\n` +
          `Gagnant : ${result.gagnant}\n` +
          `A: ${result.reply_rate_a.toFixed(1)}% (${parseInt(a.envois)} envois)\n` +
          `B: ${result.reply_rate_b.toFixed(1)}% (${parseInt(b.envois)} envois)\n` +
          `Confiance : ${result.confiance.toFixed(1)}%\n` +
          `${result.recommandation}`,
      })
    }
  }
}
```

---

## 7. FEEDBACK LOOP

### 7.1 Agent 7 --> Agent 1 (VEILLEUR) : Ajuster sources et mots-cles

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Source sans conversion depuis 30 jours | Requete conversion par source | Reduire priorite de la source ou ajuster les mots-cles de detection | Mensuel | Jonathan approuve |
| Segment surrepresente sans ROI | Ratio leads/deals par segment | Reequilibrer les sources vers les segments qui convertissent | Mensuel | Jonathan approuve |
| Signaux qui ne menent pas a des deals | Correlation signal_type vs outcome | Ajuster les poids de pre-scoring, retirer les signaux non predictifs | Mensuel | Automatique si data > 200 leads |
| Budget API depasse | Couts vs budget alloue | Optimiser les frequences de scan, privilegier les sources gratuites | Hebdomadaire | Automatique |

**Format de recommandation** :

```
DE : Agent 7 ANALYSTE
A : Agent 1 VEILLEUR
DATE : 2026-04-01
PRIORITE : HAUTE

CONSTAT : La source '1d_jobboards' genere 25% des leads mais 0%
des deals sur les 60 derniers jours. Le signal 'recrutement_dev_web'
a un taux de conversion de 0.8% vs 4.2% pour 'changement_poste'.

ACTION RECOMMANDEE :
1. Reduire la frequence de scan job boards de 1x/jour a 2x/semaine
2. Augmenter le poids du signal 'changement_poste' de 25 a 30 pts
3. Reduire le poids du signal 'recrutement_dev_web' de 22 a 15 pts
4. Ajouter le mot-cle 'refonte site' aux recherches web (1c)

IMPACT ESTIME : +15% de leads qualifies a volume egal

STATUT : EN ATTENTE VALIDATION JONATHAN
```

### 7.2 Agent 7 --> Agent 3 (SCOREUR) : Ajuster poids du scoring

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Precision HOT < 30% | Matrice confusion scoring vs outcomes | Augmenter seuil HOT, ajuster poids des axes | Mensuel | Jonathan approuve |
| Faux negatifs > 10% | Deals qui etaient COLD/DISQ | Baisser le seuil ou augmenter le poids des signaux manques | Mensuel | Jonathan approuve |
| Distribution desequilibree (HOT > 20%) | Distribution des categories | Resserrer les criteres de qualification | Hebdomadaire | Automatique |
| Score moyen des deals diverge | Correlation score vs montant_deal | Ajuster les bonus de segment | Trimestriel | Jonathan approuve |

### 7.3 Agent 7 --> Agent 4 (REDACTEUR) : Templates

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Template reply rate < 3% (N >= 50) | Performance par template | Desactiver le template, creer une variante | Continu | Automatique |
| A/B test concluant | Significativite statistique | Adopter le gagnant, desactiver le perdant | Continu | Automatique |
| Hook fatigue (baisse progressive) | Trend reply rate sur 4 semaines | Iterer un nouveau hook, lancer A/B test | Mensuel | Jonathan approuve |
| Segment-specific underperformance | Reply rate par segment x template | Creer un template specifique au segment | Mensuel | Jonathan approuve |

### 7.4 Agent 7 --> Agent 5 (SUIVEUR) : Sequences et timing

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Opt-out rate > 0.5% | Taux opt-out par segment et par etape | Raccourcir les sequences pour les segments concernes | Hebdomadaire | Automatique |
| Bounce rate > 3% sur un domaine | Performance par domaine d'envoi | Suspendre le domaine, activer un backup | Continu (alerte) | Automatique |
| Reponses concentrees etape 1-2 | Distribution reponses par etape | Optimiser les etapes suivantes ou reduire la sequence | Mensuel | Jonathan approuve |
| Horaire optimal detecte | Correlation envoi_hour vs reply | Ajuster les horaires d'envoi (ex: 9h plutot que 14h) | Mensuel | Automatique |
| LinkedIn acceptance trop basse | Taux acceptation < 20% | Ajuster la note de connexion, cibler mieux | Mensuel | Jonathan approuve |

### 7.5 Agent 7 --> Agent 6 (NURTUREUR) : Frequence et contenu

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Sunset > 60% dans un segment | Taux sunset par segment | Ajuster frequence, adapter contenu | Mensuel | Jonathan approuve |
| Contenu X pas ouvert (< 10% ouverture) | Performance par content_piece_id | Retirer le contenu, le remplacer | Mensuel | Automatique |
| Engagement moyen en baisse | Trend engagement_score_moyen | Introduire du contenu frais, varier les formats | Mensuel | Jonathan approuve |
| Re-engagement rate < 10% | Taux de reactivation des inactifs | Ajuster les workflows de re-engagement, tester de nouvelles accroches | Trimestriel | Jonathan approuve |

### 7.6 Processus de validation humaine

```
1. Agent 7 genere la recommandation
2. Recommandation stockee en BDD (statut = 'PENDING')
3. Notification Slack a Jonathan avec boutons [Approuver] [Rejeter] [Reporter]
4. Jonathan clique [Approuver]
5. Statut passe a 'APPROVED'
6. L'agent concerne est notifie via Slack + flag en BDD
7. L'agent applique la modification
8. Statut passe a 'IMPLEMENTED'
9. Agent 7 mesure l'impact apres 2 semaines (result_after_implementation)
```

**Exceptions (validation automatique)** :
- Templates avec reply rate < 3% sur N >= 50 : desactivation automatique
- Bounce rate domaine > 5% : suspension automatique du domaine
- Budget API depasse : reduction frequence automatique

---

## 8. FORECASTING

### 8.1 Pipeline Coverage Ratio

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

### 8.2 Previsions 30/60/90 jours

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

### 8.3 Section du rapport mensuel : Forecasting

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

## 9. RAPPORTS

### 9.1 Digest quotidien (envoye a 22h)

Template exact que Jonathan recevra :

```
AXIOM MARKETING -- DIGEST QUOTIDIEN
2026-03-18 | Statut pipeline : VERT
==================================================

PIPELINE AUJOURD'HUI :
  Leads detectes : 42 (+8 vs hier)
  Leads qualifies : 12 (+3)
  Emails envoyes : 18 (=)
  Taux reponse : 5.6% (+0.4pp)
  Reponses positives : 1

SCORING :
  HOT: 2 | WARM: 5 | COLD: 3 | DISQ: 2

NURTURE :
  Total en nurture : 187
  Reclassifies HOT : 0

BUSINESS :
  Deals gagnes : 0
  Revenu du jour : 0 EUR
  Pipeline total : 125,400 EUR

COUTS : 14.30 EUR
==================================================
Agent 7 ANALYSTE v1.0
```

### 9.2 Rapport hebdomadaire (envoye lundi 9h -- 1 page)

Template exact :

```
==============================================================
AXIOM MARKETING -- RAPPORT HEBDOMADAIRE
Semaine du 2026-03-11 au 2026-03-17
Agent 7 ANALYSTE
==============================================================

RESUME EXECUTIF
--------------------------------------------------------------
Pipeline sain (VERT). Reply rate a 5.2% (objectif atteint).
2 deals gagnes cette semaine pour 18,500 EUR. Template B
surperforme Template A -- A/B test en cours de conclusion.
Point d'attention : bounce rate en hausse sur domaine
axiom-marketing.fr (1.8%).

METRIQUES CLES
--------------------------------------------------------------
Metrique                   Semaine  Sem. prec.  Objectif  Statut
--------------------------------------------------------------
Leads detectes             287      265         200+      OK
Leads qualifies            72       64          50+       OK
Emails envoyes             95       88          70+       OK
Taux reponse               5.2%     4.8%        >= 5%     OK
Reponses positives         5        4           5+        OK
Deals gagnes               2        1           2-4       OK
Revenu                     18,500   8,000       10-20K    OK
Pipeline total             125,400  118,200     100K+     OK
Bounce rate                1.4%     0.9%        < 2%      ATTENTION
Opt-outs                   1        0           < 3       OK
Couts totaux               98 EUR   92 EUR      -         -

SCORING SEMAINE
--------------------------------------------------------------
HOT: 12 (9%) | WARM: 38 (28%) | COLD: 54 (40%) | DISQ: 31 (23%)
Score moyen : 44.2 (+1.3 vs sem. prec.)

NURTURE
--------------------------------------------------------------
Total en nurture : 187 (+8)
Reclassifies HOT : 1
Engagement moyen : 28.4

TOP 3 RECOMMANDATIONS
--------------------------------------------------------------
1. [REDACTEUR] Template A en baisse (-0.8pp). A/B test B
   montre +1.2pp. Recommandation : conclure et adopter B.
2. [SUIVEUR] Bounce rate axiom-marketing.fr en hausse.
   Verifier reputation domaine. Activer rotation si > 2%.
3. [VEILLEUR] Source job boards 0 conversion sur 14 jours.
   Ajuster mots-cles ou reduire frequence.

==============================================================
```

### 9.3 Rapport mensuel strategique (1er du mois -- 3 pages)

Template exact (resume par Claude API a partir des donnees) :

```
==============================================================
AXIOM MARKETING -- RAPPORT MENSUEL STRATEGIQUE
Mars 2026
Agent 7 ANALYSTE v1.0
==============================================================

PAGE 1 : EXECUTIVE SUMMARY & ROI
--------------------------------------------------------------

RESUME
Le mois de mars a ete un mois de lancement et de calibration
du systeme. 7 deals gagnes pour un total de 52,300 EUR.
Le CAC est de 132 EUR (objectif < 500 EUR -- EXCELLENT).
Le ROI mensuel est de 56x (revenu / couts pipeline).

ROI DU MOIS
--------------------------------------------------------------
Revenu total             : 52,300 EUR (7 deals)
Couts pipeline total     : 935 EUR
  - Agent 1 (Veilleur)   : 430 EUR
  - Agent 2 (Enrichisseur): 180 EUR
  - Agent 3 (Scoreur)     : 0 EUR
  - Agent 4 (Redacteur)   : 25 EUR
  - Agent 5 (Suiveur)     : 150 EUR
  - Agent 6 (Nurtureur)   : 37 EUR
  - Agent 7 (Analyste)    : 113 EUR
ROI                      : 56x
CAC                      : 132 EUR/deal
LTV:CAC estime           : 38:1 (LTV = 5,000 EUR, 12 mois)
Deal moyen               : 7,471 EUR

FUNNEL COMPLET DU MOIS
--------------------------------------------------------------
Etape                    Volume    Conversion    Drop-off
--------------------------------------------------------------
Leads bruts detectes     1,245     -             -
Leads qualifies          312       25.1%         74.9%
Prospects enrichis       298       95.5%         4.5%
Prospects scores         298       100%          0%
  dont HOT               30        10.1%         -
  dont WARM              89        29.9%         -
  dont COLD              119       39.9%         -
  dont DISQUALIFIE       60        20.1%         -
Prospects contactes      119       39.9%         60.1%
Emails envoyes           380       -             -
Reponses recues          19        5.0%          -
Reponses positives       8         2.1%          -
RDV/Propositions         7         -             -
Deals gagnes             7         1.8%          -

Conversion E2E : 7 / 1,245 = 0.56%
(Objectif Phase 1 : >= 2% -- A AMELIORER)

PAGE 2 : SEGMENTS, TEMPLATES, ATTRIBUTION
--------------------------------------------------------------

PERFORMANCE PAR SEGMENT
--------------------------------------------------------------
Segment          Leads  Contact  Reply%  Deals  Revenue   CAC
--------------------------------------------------------------
pme_metro        480    45       5.3%    3      22,500    130
ecommerce_shopify 310   32       4.8%    2      14,800    118
collectivite     125    12       6.2%    1      10,000    180
startup          180    20       4.0%    1      5,000     145
agence_wl        150    10       7.5%    0      0         -

Meilleur segment : agence_wl (meilleur reply rate) mais
0 deal -- echantillon trop petit. A surveiller.

PERFORMANCE TEMPLATES
--------------------------------------------------------------
Template        Envois  Reply%   Deals   Revenue attr.  Statut
--------------------------------------------------------------
TMPL_HOT_01     98      6.1%     3       18,200         OK
TMPL_WARM_01    145     4.1%     2       12,400         OK
TMPL_COLD_01    85      3.5%     1       8,200          WARNING
TMPL_HOT_02     52      7.7%     1       13,500         GAGNANT A/B

Recommandation : Adopter TMPL_HOT_02, desactiver TMPL_COLD_01
si reply rate reste < 3% sur 2 semaines supplementaires.

ATTRIBUTION (U-Shaped)
--------------------------------------------------------------
Canal                   Credit%  Revenue attr.  Deals
--------------------------------------------------------------
email_cold              42%      21,966 EUR     5
linkedin_connection     22%      11,506 EUR     4
email_followup          18%      9,414 EUR      3
email_nurture           12%      6,276 EUR      2
linkedin_message        6%       3,138 EUR      1

PAGE 3 : FORECASTING, CALIBRATION, RISQUES
--------------------------------------------------------------

FORECASTING
--------------------------------------------------------------
                    Conservative  Moderate  Optimiste
30 jours (Avr)     45,000 EUR   55,000    68,000 EUR
60 jours (Mai)     95,000 EUR   125,000   160,000 EUR
90 jours (Juin)    150,000 EUR  210,000   270,000 EUR

Pipeline coverage : 3.1x (BON)
Velocity : 1,743 EUR/jour
Confiance : MOYENNE

CALIBRATION SCORING
--------------------------------------------------------------
Precision HOT  : 33% (objectif >= 30% -- OK)
Recall         : 57% (objectif >= 60% -- PROCHE)
Faux positifs  : 37% (objectif < 40% -- OK)
Faux negatifs  : 14% (objectif < 10% -- A AMELIORER)
Score moyen deals : 68 (objectif >= 65 -- OK)

Recommandation : Augmenter le poids de l'Axe 2 (Signaux)
de 30 a 33 pts pour reduire les faux negatifs.
Les signals 'changement_poste' et 'levee_fonds' sont les
plus predictifs (correlation 0.72 avec conversion).

TOP 5 PRIORITES AVRIL
--------------------------------------------------------------
1. [SCOREUR] Ajuster poids Axe 2 (30 -> 33 pts) pour reduire
   faux negatifs de 14% a < 10%
2. [REDACTEUR] Adopter TMPL_HOT_02 comme nouveau control.
   Creer nouveau challenger pour le segment agence_wl
3. [VEILLEUR] Ajouter mots-cles 'refonte', 'migration' aux
   recherches 1c (web). Reduire job boards a 2x/semaine
4. [SUIVEUR] Verifier reputation domaine axiom-marketing.fr.
   Preparer domaine backup si bounce > 2%
5. [NURTUREUR] Creer contenu specifique segment collectivite
   (guide RGAA, timeline conformite)

RISQUES ET POINTS D'ATTENTION
--------------------------------------------------------------
- Conversion E2E a 0.56% (objectif 2%) -- early stage, normal
  mais a surveiller semaine par semaine
- Domaine axiom-marketing.fr : bounce rate en hausse (1.4%)
- Segment startup : 1 deal seulement, deal moyen bas (5K EUR)
  Evaluer si le segment vaut l'effort
- Faux negatifs a 14% : des deals potentiels sont rates par
  le scoring. La calibration est prioritaire

==============================================================
Genere automatiquement par Agent 7 ANALYSTE v1.0
Donnees extraites le 2026-04-01 a 08:00
Prochain rapport : 2026-05-01
==============================================================
```

---

## 10. ALERTES

### 10.1 Matrice des alertes

| Anomalie | Seuil WARNING | Seuil CRITICAL | Canal | Delai |
|---|---|---|---|---|
| Reply rate chute | < 3% (vs moy 7j -1.5 sigma) | < 2% (vs moy 7j -2.5 sigma) | #pipeline-metrics | Quotidien |
| Bounce rate explose | > 3% | > 5% | #alerts-critical + DM Jonathan | Immediat |
| 0 leads detectes | - | 0 leads en 24h | #alerts-critical + DM Jonathan | Immediat |
| 0 emails envoyes | - | 0 emails en 24h | #alerts-critical + DM Jonathan | Immediat |
| Opt-out spike | > 0.5% | > 1% | #pipeline-metrics | Quotidien |
| SLA breach accumulation | > 3 breaches/jour | > 5 breaches/jour | #pipeline-metrics | Quotidien |
| Scoring trop genereux (HOT > 25%) | > 25% | > 40% | #pipeline-metrics | Quotidien |
| Scoring trop strict (HOT < 3%) | < 3% | < 1% | #pipeline-metrics | Quotidien |
| API budget depasse 80% | > 80% du budget mensuel | > 100% | #alerts-critical | Quotidien |
| Enrichissement en panne | Taux < 60% | Taux < 40% | #alerts-critical + DM Jonathan | Immediat |

### 10.2 Format Slack des alertes

```
---------- ALERTE CRITICAL ----------
Date : 2026-03-18 21:50

ANOMALIE : Bounce rate explose
Valeur actuelle : 5.8%
Moyenne 7 jours : 1.2%
Z-score : 3.4

CAUSE PROBABLE :
  Domaine axiom-marketing.fr reputation degradee
  Ou changement politique ISP (Gmail/Outlook)

ACTIONS IMMEDIATES RECOMMANDEES :
  1. SUSPENDRE les envois sur axiom-marketing.fr
  2. ACTIVER le domaine backup (contact-axiom.fr)
  3. VERIFIER la reputation sur mail-tester.com
  4. AUDITER les derniers envois (spam words ?)

[Voir Dashboard]  [Acknowledger]
-----------------------------------------
```

---

## 11. DASHBOARD

### 11.1 Specification Metabase

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

### 11.2 Dashboard principal : Vue pipeline

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

### 11.3 Requetes Metabase

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

### 11.4 Dashboards secondaires

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

## 12. COUTS

### 12.1 Couts de l'Agent 7

| Poste | Cout mensuel | Details |
|---|---|---|
| **Claude API** (rapports + recommandations) | ~30 EUR | ~50 appels/mois |
| **Slack API** | 0 EUR | Free plan suffisant |
| **Gmail API** (envoi rapports email) | 0 EUR | Gratuit |
| **Metabase** (self-hosted) | ~10 EUR | Part du serveur Docker |
| **Infrastructure** (cron workers, Redis part) | ~10 EUR | Part du VPS |
| **PostgreSQL** (tables analyste) | 0 EUR | Inclus dans l'infra existante |
| **TOTAL Agent 7** | **~50 EUR/mois** | |

### 12.2 Detail Claude API Agent 7

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

### 12.3 Cout total du systeme complet (7 agents)

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
| **TOTAL SYSTEME** | **~932 EUR/mois** | 100% |

### 12.4 Cout annuel total

| Poste | Cout annuel |
|---|---|
| APIs et services (tous agents) | ~9,100 EUR |
| Infrastructure (VPS, domaines, warmup) | ~2,100 EUR |
| **Total annuel** | **~11,200 EUR** |

### 12.5 ROI du systeme

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

## 13. VERIFICATION DE COHERENCE GLOBALE

### 13.1 Chaine des inputs/outputs entre agents

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

### 13.2 Schema de BDD global -- Toutes les tables

```sql
-- ============================================
-- RECAPITULATIF COMPLET DU SCHEMA BDD
-- Toutes les tables de tous les 7 agents
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

### 13.3 Volumes realistes bout en bout

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

### 13.4 Couts totaux du systeme

| Agent | APIs/Services | Infrastructure | Claude API | Total |
|---|---|---|---|---|
| Agent 1 (VEILLEUR) | 390 EUR | 40 EUR | 0 EUR | 430 EUR |
| Agent 2 (ENRICHISSEUR) | 170 EUR | 10 EUR | 0 EUR | 180 EUR |
| Agent 3 (SCOREUR) | 0 EUR | 0 EUR (partage) | 0 EUR | 0 EUR |
| Agent 4 (REDACTEUR) | 0 EUR | 0 EUR (partage) | 25 EUR | 25 EUR |
| Agent 5 (SUIVEUR) | 110 EUR | 20 EUR | 5 EUR | 150 EUR* |
| Agent 6 (NURTUREUR) | 20 EUR | 5 EUR | 12 EUR | 37 EUR |
| Agent 7 (ANALYSTE) | 0 EUR | 20 EUR | 30 EUR | 50 EUR |
| Infrastructure partagee | - | 60 EUR | - | 60 EUR |
| **TOTAL** | **690 EUR** | **155 EUR** | **72 EUR** | **932 EUR** |

*Agent 5 inclut Waalaxy (19 EUR), Mailreach warmup (60-75 EUR), domaines, etc.

**Cout par deal (si 7 deals/mois) : 133 EUR**
**Cout par deal (si 15 deals/mois) : 62 EUR**

### 13.5 ROI global attendu

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

### 13.6 Risques et points d'attention

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

### 13.7 Checklist finale du systeme complet

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
| Budget mensuel total : ~932 EUR | VALIDE |
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

## 14. INTEGRATION AVEC LES AGENTS 8, 9, 10

> **Ajout v1.1 -- 19 mars 2026** : Cette section documente l'integration de l'Analyste avec les trois nouveaux agents du pipeline etendu (Agent 8 Dealmaker, Agent 9 Appels d'offres, Agent 10 CSM).

### 14.1 Synthese de l'impact

| Agent | Impact sur Agent 7 | Nature |
|-------|-------------------|--------|
| **Agent 8 (Dealmaker)** | SIGNIFICATIF | Nouvelles tables SQL a interroger, nouveaux KPIs a tracker (win rate, cycle de vente, valeur deals, pipeline coverage), nouveaux rapports, feedback loop enrichi. |
| **Agent 9 (Appels d'offres)** | SIGNIFICATIF | Nouvelles tables SQL (AO detectes, reponses, resultats), nouveaux KPIs (taux de succes AO, valeur marches gagnes, delai moyen reponse), rapport marches publics dedie. |
| **Agent 10 (CSM)** | SIGNIFICATIF | Nouvelles tables SQL (clients actifs, NPS, churn, referrals, upsell), nouveaux KPIs (NPS moyen, retention, churn rate, referral conversion, CLV), rapport CSM dedie. |

**L'Agent 7 est le PLUS impacte** par l'ajout des 3 nouveaux agents car il doit collecter, analyser et rapporter les metriques de l'ensemble du pipeline etendu (10 agents au lieu de 7).

### 14.2 Nouvelles sources de donnees (section 2.2 etendue)

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

### 14.3 Nouveaux KPIs a tracker

#### 14.3.1 KPIs Agent 8 (Dealmaker)

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

#### 14.3.2 KPIs Agent 9 (Appels d'offres)

| KPI | Formule | Objectif | Frequence |
|-----|---------|----------|-----------|
| **Taux de succes AO** | AO gagnes / AO soumis | > 20% | Mensuel |
| **Taux GO/NO-GO** | AO scores GO / Total AO detectes | 30-50% (selectivite) | Mensuel |
| **Valeur marches gagnes** | SUM(montant) des AO gagnes | En croissance | Mensuel |
| **Delai moyen preparation** | AVG(date_soumission - date_detection) en jours | < 70% du delai disponible | Mensuel |
| **Precision scoring GO/NO-GO** | AO soumis avec score GO qui ont ete gagnes vs perdus | Correlation positive | Trimestriel |
| **ROI marches publics** | (Valeur marches gagnes - Cout Agent 9) / Cout Agent 9 | > 5x | Trimestriel |

#### 14.3.3 KPIs Agent 10 (CSM)

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

### 14.4 Nouvelles colonnes dans metriques_daily

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

### 14.5 Nouveaux rapports a generer

#### 14.5.1 Digest quotidien (etendu)

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

#### 14.5.2 Rapport hebdomadaire etendu (lundi 09:00)

Nouveaux blocs dans le rapport hebdomadaire :

| Bloc | Contenu |
|------|---------|
| **Pipeline Deals (Agent 8)** | Deals par stage, velocity, win rate, top deals en cours, deals a risque, raisons de perte |
| **Marches Publics (Agent 9)** | AO detectes vs soumis, resultats, pipeline AO, delais de preparation |
| **Satisfaction Client (Agent 10)** | NPS trend, health score distribution, alertes churn, referrals, upsell |

#### 14.5.3 Rapport mensuel strategique etendu (1er du mois)

Nouveaux KPIs strategiques dans le rapport mensuel :

| Section | KPIs |
|---------|------|
| **Revenue** | MRR, ARR, croissance MRR, MRR expansion (upsell), MRR contraction (churn) |
| **Sales efficiency** | Win rate, cycle de vente, CAC (cout acquisition), CAC payback period |
| **Client success** | NPS trend 12 mois, retention, CLV, health score trend |
| **Marches publics** | Taux de succes, valeur gagnee, ROI Agent 9 |
| **Referral engine** | Referrals/mois, conversion rate, valeur referral pipeline, % du pipeline total |

### 14.6 Feedback loop vers Agents 8, 9, 10

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

### 14.7 Nouvelles vues SQL exploitees

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

### 14.8 Ce qui NE change PAS

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

TOTAL SYSTEME : ~932 EUR/mois | ROI minimum : 43x
```

---

**FIN DU DOCUMENT -- SYSTEME COMPLET DE 7 AGENTS BOUCLE**

*Le systeme de prospection automatisee Axiom Marketing est maintenant entierement specifie. Les 7 agents couvrent la chaine complete de la detection de leads jusqu'a l'analyse et l'optimisation continue. Chaque input est un output d'un autre agent. Chaque metrique est mesuree. Chaque anomalie est detectee. Chaque recommandation est tracee.*
