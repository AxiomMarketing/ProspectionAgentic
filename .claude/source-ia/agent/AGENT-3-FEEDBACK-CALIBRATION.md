# AGENT 3 — FEEDBACK ET CALIBRATION
**Agent parent** : AGENT-3-MASTER.md
**Contenu** : Feedback loop, metriques performance, recalibration, transition ML

---

## TABLE DES MATIERES

1. [Architecture du feedback loop](#1-architecture-du-feedback-loop)
2. [Table des outcomes (resultats reels)](#2-table-des-outcomes-resultats-reels)
3. [Metriques de performance du scoring](#3-metriques-de-performance-du-scoring)
4. [Plan de recalibration mensuel](#4-plan-de-recalibration-mensuel)
5. [Transition vers ML predictif](#5-transition-vers-ml-predictif)

---

## 1. ARCHITECTURE DU FEEDBACK LOOP

```
┌────────────────────┐
│  Lead Score         │
│  (Agent 3)          │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Lead Contacte      │
│  (Agent 4+5)        │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Outcome Enregistre │◄────────────────┐
│  - converti         │                 │
│  - pas_interesse    │            FEEDBACK
│  - pas_de_reponse   │              LOOP
│  - disqualifie      │                 │
│  - nurture          │                 │
└──────────┬──────────┘                 │
           │                            │
┌──────────▼─────────────────────────┐  │
│  Comparer Prediction vs Realite   │  │
│                                    │  │
│  Score 82 (HOT)  -> Converti?  OUI│  │
│  Score 65 (WARM) -> Converti?  NON│  │
│  Score 42 (COLD) -> Converti?  OUI│ (Faux negatif!)
│  Score 15 (DISQ) -> Converti?  NON│  │
└──────────┬─────────────────────────┤  │
           │                            │
┌──────────▼──────────┐                │
│  Ajuster les poids  │────────────────┘
│  du scoring         │
└─────────────────────┘
```

---

## 2. TABLE DES OUTCOMES (RESULTATS REELS)

```sql
CREATE TABLE IF NOT EXISTS prospect_outcomes (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  score_at_contact INTEGER NOT NULL,
  categorie_at_contact VARCHAR(20) NOT NULL,
  segment VARCHAR(30) NOT NULL,

  outcome VARCHAR(30) NOT NULL CHECK (outcome IN (
    'converti',           -- Deal signe
    'opportunite',        -- Pipeline actif, pas encore signe
    'interesse',          -- A repondu positivement mais pas de deal
    'pas_interesse',      -- A repondu negativement
    'pas_de_reponse',     -- Aucune reponse apres la sequence complete
    'disqualifie_post',   -- Disqualifie apres contact (ex: plus le bon interlocuteur)
    'nurture'             -- A remis a plus tard, en nurturing
  )),

  montant_deal NUMERIC(12,2),           -- Montant du deal si converti
  date_premier_contact TIMESTAMP WITH TIME ZONE,
  date_outcome TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  cycle_vente_jours INTEGER,            -- Jours entre premier contact et outcome
  canal_conversion VARCHAR(30),         -- Canal qui a converti (linkedin, email, telephone, inbound)
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outcomes_outcome ON prospect_outcomes (outcome);
CREATE INDEX idx_outcomes_segment ON prospect_outcomes (segment);
CREATE INDEX idx_outcomes_date ON prospect_outcomes (date_outcome);
```

---

## 3. METRIQUES DE PERFORMANCE DU SCORING

### 3.1 KPIs principaux

| Metrique | Definition | Objectif Phase 1 | Objectif Phase 2 |
|----------|-----------|-------------------|-------------------|
| **Precision HOT** | % des HOT leads qui convertissent en deal ou opportunite | >= 30% | >= 40% |
| **Recall** | % des deals reels qui etaient dans la categorie HOT | >= 60% | >= 75% |
| **Faux positifs HOT** | % des HOT leads qui ne repondent meme pas | < 40% | < 25% |
| **Faux negatifs** | % des deals reels qui etaient COLD ou DISQUALIFIE | < 10% | < 5% |
| **Taux de reponse HOT** | % des HOT qui repondent (positivement ou negativement) | >= 50% | >= 65% |
| **Taux de reponse WARM** | % des WARM qui repondent | >= 25% | >= 35% |
| **Distribution score** | % HOT/WARM/COLD/DISQ | 10/30/40/20 | Ajuste selon data |
| **Score moyen des deals** | Score moyen des prospects qui convertissent | >= 65 | >= 70 |

### 3.2 Calcul des metriques

```typescript
interface ScoringMetrics {
  // Precision et recall
  precision_hot: number          // TP_hot / (TP_hot + FP_hot)
  recall: number                 // TP_hot / (TP_hot + FN)
  f1_score: number              // 2 * (precision * recall) / (precision + recall)

  // Taux de reponse
  response_rate_hot: number
  response_rate_warm: number
  response_rate_cold: number

  // Distribution
  pct_hot: number
  pct_warm: number
  pct_cold: number
  pct_disqualifie: number

  // Conversion
  conversion_rate_hot: number    // Deals / HOT leads
  conversion_rate_warm: number
  conversion_rate_cold: number
  avg_score_deals: number        // Score moyen des deals
  avg_deal_value: number

  // Volume
  total_scored: number
  total_with_outcome: number
  period_days: number
}

async function calculateScoringMetrics(
  db: DatabaseClient,
  periodDays: number = 30,
): Promise<ScoringMetrics> {
  // Recuperer tous les prospects scores avec outcome dans la periode
  const result = await db.query(`
    SELECT
      s.score_total,
      s.categorie,
      s.segment_primaire,
      o.outcome,
      o.montant_deal,
      o.cycle_vente_jours
    FROM scores s
    LEFT JOIN prospect_outcomes o ON s.prospect_id = o.prospect_id
    WHERE s.scored_at >= NOW() - INTERVAL '${periodDays} days'
  `)

  const rows = result.rows
  const total = rows.length
  const withOutcome = rows.filter((r: any) => r.outcome !== null)

  // HOT leads
  const hotLeads = rows.filter((r: any) => r.categorie === 'HOT')
  const hotConverted = hotLeads.filter((r: any) => ['converti', 'opportunite'].includes(r.outcome))
  const hotResponded = hotLeads.filter((r: any) =>
    r.outcome && r.outcome !== 'pas_de_reponse'
  )

  // Deals reels (converti ou opportunite)
  const allDeals = withOutcome.filter((r: any) => ['converti', 'opportunite'].includes(r.outcome))
  const dealsNotHot = allDeals.filter((r: any) => r.categorie !== 'HOT')

  // WARM leads
  const warmLeads = rows.filter((r: any) => r.categorie === 'WARM')
  const warmResponded = warmLeads.filter((r: any) =>
    r.outcome && r.outcome !== 'pas_de_reponse'
  )
  const warmConverted = warmLeads.filter((r: any) => ['converti', 'opportunite'].includes(r.outcome))

  // COLD leads
  const coldLeads = rows.filter((r: any) => r.categorie === 'COLD')
  const coldResponded = coldLeads.filter((r: any) =>
    r.outcome && r.outcome !== 'pas_de_reponse'
  )
  const coldConverted = coldLeads.filter((r: any) => ['converti', 'opportunite'].includes(r.outcome))

  const TP_hot = hotConverted.length
  const FP_hot = hotLeads.length - TP_hot
  const FN = dealsNotHot.length // Deals qui n'etaient pas HOT

  const precision = TP_hot / (TP_hot + FP_hot) || 0
  const recall = TP_hot / (TP_hot + FN) || 0
  const f1 = precision + recall > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0

  return {
    precision_hot: Math.round(precision * 100),
    recall: Math.round(recall * 100),
    f1_score: Math.round(f1 * 100),
    response_rate_hot: hotLeads.length > 0
      ? Math.round((hotResponded.length / hotLeads.length) * 100) : 0,
    response_rate_warm: warmLeads.length > 0
      ? Math.round((warmResponded.length / warmLeads.length) * 100) : 0,
    response_rate_cold: coldLeads.length > 0
      ? Math.round((coldResponded.length / coldLeads.length) * 100) : 0,
    pct_hot: Math.round((hotLeads.length / total) * 100),
    pct_warm: Math.round((warmLeads.length / total) * 100),
    pct_cold: Math.round((coldLeads.length / total) * 100),
    pct_disqualifie: Math.round(
      (rows.filter((r: any) => r.categorie === 'DISQUALIFIE').length / total) * 100
    ),
    conversion_rate_hot: hotLeads.length > 0
      ? Math.round((hotConverted.length / hotLeads.length) * 100) : 0,
    conversion_rate_warm: warmLeads.length > 0
      ? Math.round((warmConverted.length / warmLeads.length) * 100) : 0,
    conversion_rate_cold: coldLeads.length > 0
      ? Math.round((coldConverted.length / coldLeads.length) * 100) : 0,
    avg_score_deals: allDeals.length > 0
      ? Math.round(allDeals.reduce((s: number, r: any) => s + r.score_total, 0) / allDeals.length)
      : 0,
    avg_deal_value: allDeals.filter((r: any) => r.montant_deal).length > 0
      ? Math.round(
          allDeals
            .filter((r: any) => r.montant_deal)
            .reduce((s: number, r: any) => s + parseFloat(r.montant_deal), 0)
          / allDeals.filter((r: any) => r.montant_deal).length
        )
      : 0,
    total_scored: total,
    total_with_outcome: withOutcome.length,
    period_days: periodDays,
  }
}
```

---

## 4. PLAN DE RECALIBRATION MENSUEL

| Etape | Frequence | Action | Critere de declenchement |
|-------|-----------|--------|--------------------------|
| 1 | **Hebdomadaire** | Verifier la distribution HOT/WARM/COLD/DISQ | Si HOT > 15% ou COLD > 50% |
| 2 | **Mensuel** | Comparer 20-30 leads avec outcomes | Systematique |
| 3 | **Mensuel** | Ajuster les poids si precision HOT < 30% | Precision HOT < seuil |
| 4 | **Trimestriel** | Analyse complete 50+ leads avec outcomes | Systematique |
| 5 | **Trimestriel** | Recalculer les seuils HOT/WARM/COLD | Si distribution tres desequilibree |
| 6 | **Semestriel** | Revue strategique complete du modele | Systematique |

### 4.1 Regles d'ajustement automatique

```typescript
interface CalibrationAdjustment {
  axe: 'axe1' | 'axe2' | 'axe3' | 'axe4' | 'seuils'
  ajustement: string
  amplitude: number // % d'ajustement
  raison: string
}

function analyserCalibration(metrics: ScoringMetrics): CalibrationAdjustment[] {
  const adjustments: CalibrationAdjustment[] = []

  // 1. Trop de HOT leads (precision faible)
  if (metrics.pct_hot > 15 && metrics.precision_hot < 30) {
    adjustments.push({
      axe: 'seuils',
      ajustement: 'Augmenter le seuil HOT de 75 a 80',
      amplitude: 5,
      raison: `${metrics.pct_hot}% de HOT mais seulement ${metrics.precision_hot}% de precision`,
    })
  }

  // 2. Trop peu de HOT leads (rappel faible)
  if (metrics.pct_hot < 5 && metrics.recall < 50) {
    adjustments.push({
      axe: 'seuils',
      ajustement: 'Baisser le seuil HOT de 75 a 70',
      amplitude: -5,
      raison: `Seulement ${metrics.pct_hot}% de HOT et ${metrics.recall}% de recall`,
    })
  }

  // 3. Les deals viennent principalement du WARM (faux negatifs)
  if (metrics.conversion_rate_warm > metrics.conversion_rate_hot * 0.5) {
    adjustments.push({
      axe: 'axe2',
      ajustement: 'Augmenter le poids des signaux (Axe 2) de 10%',
      amplitude: 10,
      raison: `WARM conversion rate (${metrics.conversion_rate_warm}%) trop proche du HOT (${metrics.conversion_rate_hot}%)`,
    })
  }

  // 4. Score moyen des deals trop bas (mauvaise discrimination)
  if (metrics.avg_score_deals < 60) {
    adjustments.push({
      axe: 'axe1',
      ajustement: 'Revoir les criteres ICP Fit -- poids trop faibles',
      amplitude: 15,
      raison: `Score moyen des deals = ${metrics.avg_score_deals}, devrait etre >= 65`,
    })
  }

  // 5. Trop de DISQUALIFIES (seuils trop stricts)
  if (metrics.pct_disqualifie > 30) {
    adjustments.push({
      axe: 'seuils',
      ajustement: 'Revoir les criteres de disqualification -- trop agressifs',
      amplitude: -10,
      raison: `${metrics.pct_disqualifie}% de disqualifies, devrait etre ~20%`,
    })
  }

  return adjustments
}
```

### 4.2 Rapport de calibration mensuel

```typescript
async function genererRapportCalibration(db: DatabaseClient): Promise<string> {
  const metrics30j = await calculateScoringMetrics(db, 30)
  const metrics90j = await calculateScoringMetrics(db, 90)
  const adjustments = analyserCalibration(metrics30j)

  const rapport = `
═══════════════════════════════════════════════════════
  RAPPORT DE CALIBRATION SCORING -- ${new Date().toISOString().split('T')[0]}
═══════════════════════════════════════════════════════

METRIQUES 30 DERNIERS JOURS :
  Precision HOT :      ${metrics30j.precision_hot}% (objectif >= 30%)
  Recall :             ${metrics30j.recall}% (objectif >= 60%)
  F1-Score :           ${metrics30j.f1_score}%
  Taux reponse HOT :   ${metrics30j.response_rate_hot}% (objectif >= 50%)
  Taux reponse WARM :  ${metrics30j.response_rate_warm}% (objectif >= 25%)

DISTRIBUTION :
  HOT :          ${metrics30j.pct_hot}% (cible ~10%)
  WARM :         ${metrics30j.pct_warm}% (cible ~30%)
  COLD :         ${metrics30j.pct_cold}% (cible ~40%)
  DISQUALIFIE :  ${metrics30j.pct_disqualifie}% (cible ~20%)

CONVERSION :
  HOT -> Deal :  ${metrics30j.conversion_rate_hot}% (objectif >= 30%)
  WARM -> Deal : ${metrics30j.conversion_rate_warm}%
  COLD -> Deal : ${metrics30j.conversion_rate_cold}%
  Score moyen deals : ${metrics30j.avg_score_deals}
  Valeur moyenne deal : ${metrics30j.avg_deal_value} EUR

VOLUME :
  Total scores : ${metrics30j.total_scored}
  Avec outcome : ${metrics30j.total_with_outcome}

TENDANCE 90 JOURS :
  Precision HOT 90j : ${metrics90j.precision_hot}% (vs 30j: ${metrics30j.precision_hot}%)
  Distribution stable : ${Math.abs(metrics30j.pct_hot - metrics90j.pct_hot) < 5 ? 'OUI' : 'NON'}

AJUSTEMENTS RECOMMANDES :
${adjustments.length === 0
  ? '  Aucun ajustement necessaire. Modele stable.'
  : adjustments.map(a => `  - [${a.axe}] ${a.ajustement} (raison: ${a.raison})`).join('\n')
}
═══════════════════════════════════════════════════════
`

  // Envoyer sur Slack
  await slack.send('#ops-scoring', { text: rapport })

  return rapport
}
```

---

## 5. TRANSITION VERS ML PREDICTIF

### 5.1 Phases de transition

```
PHASE 1 (Mois 1-3) : DETERMINISTE PUR
  - Modele rules-based decrit dans ce document
  - Collecte systematique des outcomes dans prospect_outcomes
  - Rapport mensuel de calibration
  - Objectif : 200+ leads avec outcomes

PHASE 2 (Mois 3-4) : CALIBRATION DETERMINISTE
  - Ajuster les poids apres 200+ leads scores
  - Analyser quels criteres predisent reellement les conversions
  - Ajustements max +/- 20% par axe
  - Ajuster les seuils si distribution desequilibree

PHASE 3 (Mois 4-6) : PILOTE ML EN PARALLELE
  - Prerequis : 300+ leads avec outcomes clairs (dont 40+ conversions)
  - Entrainer un modele Random Forest en parallele
  - A/B test : 50% leads avec deterministe, 50% avec ML
  - Comparer conversion rates, faux positifs, taux de reponse
  - ML gagne si : precision HOT +5 points ET false positive -10%

PHASE 4 (Mois 6+) : MODE HYBRIDE
  - ML pour 70% des leads (assez d'historique)
  - Deterministe en fallback pour 30% (edge cases, nouveaux segments)
  - Retraining mensuel du modele ML
  - Feedback loop continu
```

### 5.2 Donnees a collecter pour le ML (des Phase 1)

La table `prospect_outcomes` collecte deja les outcomes. En complement, logger systematiquement :

```sql
-- Vue analytique pour l'entrainement ML
CREATE OR REPLACE VIEW ml_training_data AS
SELECT
  s.prospect_id,
  -- Features ICP
  s.axe1_icp_fit,
  s.score_detail->>'taille' as feat_taille,
  s.score_detail->>'secteur' as feat_secteur,
  s.score_detail->>'localisation' as feat_localisation,
  s.score_detail->>'decideur' as feat_decideur,
  -- Features Signaux
  s.axe2_signaux,
  JSONB_ARRAY_LENGTH(p.signaux::jsonb) as feat_nb_signaux,
  p.nb_detections as feat_nb_sources,
  -- Features Techniques
  s.axe3_technique,
  (p.technique::jsonb->'performance'->>'score')::int as feat_perf_score,
  (p.technique::jsonb->'accessibilite'->>'score')::int as feat_access_score,
  -- Features Engagement
  s.axe4_engagement,
  p.enrichissement_completude as feat_completude,
  -- Features Entreprise
  p.ca_dernier as feat_ca,
  p.effectif_exact as feat_effectif,
  p.croissance_ca_pct as feat_croissance,
  -- Score et segment
  s.score_total,
  s.categorie,
  s.segment_primaire,
  -- Outcome (target variable)
  CASE
    WHEN o.outcome IN ('converti', 'opportunite') THEN 1
    ELSE 0
  END as target_converted,
  o.outcome,
  o.montant_deal,
  o.cycle_vente_jours,
  o.canal_conversion
FROM scores s
JOIN prospects p ON s.prospect_id = p.prospect_id
LEFT JOIN prospect_outcomes o ON s.prospect_id = o.prospect_id
WHERE o.outcome IS NOT NULL;
```
