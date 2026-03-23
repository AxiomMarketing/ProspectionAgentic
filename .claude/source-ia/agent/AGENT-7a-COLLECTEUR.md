# SOUS-AGENT 7a — COLLECTEUR DE METRIQUES
**Agent parent** : AGENT-7-MASTER.md

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing

---

## MISSION

Executer des requetes SQL quotidiennes sur TOUTES les tables du pipeline, calculer les metriques derivees, et les persister dans la table `metriques_daily` pour historisation et trending.

---

## TABLE SQL : metriques_daily

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

---

## CODE TYPESCRIPT : COLLECTEUR DE METRIQUES

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

---

## FORMAT DE SORTIE

Chaque jour a 21h30, la table `metriques_daily` est peuplee avec une ligne contenant ~60 metriques couvrant tous les agents. Cette table est la source de verite pour les rapports, les alertes et les tendances.
