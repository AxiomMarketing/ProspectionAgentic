# SOUS-AGENT 10c — MESUREUR SATISFACTION
**Agent parent** : AGENT-10-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 1. MISSION

Le Mesureur Satisfaction calcule et maintient le Health Score composite de chaque client, automatise les surveys NPS/CSAT, detecte les signaux de churn, et declenche les actions preventives.

---

## 2. HEALTH SCORE COMPOSITE

**Formule :**

```
Health Score = (40% x Engagement) + (30% x Satisfaction) + (30% x Croissance)
```

**Score final : 0-100**

---

## 3. INDICATEURS PAR COMPOSANTE

**A) ENGAGEMENT (40% du score)**

| Indicateur | Poids | Mesure | Source |
|---|---|---|---|
| Frequence login | 30% | Logins mensuels sur dashboard projet | Analytics |
| Reactivite emails | 25% | Taux ouverture emails Axiom | CRM/Mailchimp |
| Frequence contact | 20% | Appels, emails, tickets/mois | CRM |
| Participation formations | 15% | Presence webinaires, formations | CRM |
| Reactivite aux CTA | 10% | Reponse aux propositions, audits | CRM |

**B) SATISFACTION (30% du score)**

| Indicateur | Poids | Mesure | Source |
|---|---|---|---|
| Dernier NPS | 50% | Score NPS (normalise 0-100) | Survey |
| CSAT moyen | 30% | Score CSAT post-interaction | Survey |
| Tickets critiques ouverts | 10% | Nombre bugs/plaintes non resolus | Support |
| Sentiment communications | 10% | Analyse sentiment emails/appels | NLP |

**C) CROISSANCE (30% du score)**

| Indicateur | Poids | Mesure | Source |
|---|---|---|---|
| Revenue retention | 40% | MRR client vs mois precedent | Facturation |
| Adoption features | 30% | % features utilisees vs disponibles | Analytics |
| Croissance trafic | 20% | Evolution trafic site/app client | Analytics |
| Potentiel upsell | 10% | Score upsell (sous-agent 10b) | Interne |

---

## 4. SEUILS D'ACTION

| Score | Couleur | Statut | Action |
|---|---|---|---|
| **80-100** | Vert | Excellent | Candidat referral + promoteur + upsell |
| **60-79** | Jaune | Bon | Monitoring regulier, attention proactive |
| **50-59** | Orange | At-risk | Intervention preventive (appel, webinaire) |
| **30-49** | Orange fonce | Danger | Intervention serieuse (account review, plan remediation) |
| **< 30** | Rouge | Critique | Intervention executive + plan retention ou churn inevitable |

---

## 5. CODE TYPESCRIPT HEALTH SCORE

```typescript
// ============================================================
// HEALTH SCORE ENGINE
// ============================================================

interface HealthScoreComponents {
  engagement: EngagementMetrics
  satisfaction: SatisfactionMetrics
  growth: GrowthMetrics
}

interface EngagementMetrics {
  login_frequency_monthly: number         // Nombre de logins/mois
  email_open_rate: number                 // 0-100%
  contact_frequency_monthly: number       // Nombre contacts/mois
  training_participation_rate: number     // 0-100%
  cta_response_rate: number              // 0-100%
}

interface SatisfactionMetrics {
  last_nps_score: number                  // -100 a 100 (normalise 0-100)
  csat_average: number                    // 0-100%
  open_critical_tickets: number           // Nombre
  communication_sentiment: number         // 0-100 (positif)
}

interface GrowthMetrics {
  mrr_change_pct: number                  // -100 a +inf %
  feature_adoption_pct: number            // 0-100%
  traffic_growth_pct: number             // -100 a +inf %
  upsell_score: number                    // 0-100
}

interface HealthScoreResult {
  client_id: string
  deal_id: string
  total_score: number
  engagement_score: number
  satisfaction_score: number
  growth_score: number
  color: 'vert' | 'jaune' | 'orange' | 'rouge'
  status: 'excellent' | 'bon' | 'at_risk' | 'danger' | 'critique'
  churn_risk: boolean
  churn_probability: number               // 0-100%
  recommended_actions: string[]
  calculated_at: string
}

function calculateHealthScore(
  clientId: string,
  dealId: string,
  components: HealthScoreComponents
): HealthScoreResult {
  // ---- ENGAGEMENT (40%) ----
  const engagementRaw = calculateEngagement(components.engagement)
  const engagementScore = Math.min(engagementRaw, 100) * 0.4

  // ---- SATISFACTION (30%) ----
  const satisfactionRaw = calculateSatisfaction(components.satisfaction)
  const satisfactionScore = Math.min(satisfactionRaw, 100) * 0.3

  // ---- CROISSANCE (30%) ----
  const growthRaw = calculateGrowth(components.growth)
  const growthScore = Math.min(growthRaw, 100) * 0.3

  const totalScore = Math.round(engagementScore + satisfactionScore + growthScore)

  // Determiner couleur et statut
  const { color, status } = getHealthLevel(totalScore)

  // Detection churn
  const churnRisk = totalScore < 50
  const churnProbability = calculateChurnProbability(totalScore, components)

  // Actions recommandees
  const actions = getRecommendedActions(totalScore, color, components)

  return {
    client_id: clientId,
    deal_id: dealId,
    total_score: totalScore,
    engagement_score: Math.round(engagementRaw),
    satisfaction_score: Math.round(satisfactionRaw),
    growth_score: Math.round(growthRaw),
    color,
    status,
    churn_risk: churnRisk,
    churn_probability: churnProbability,
    recommended_actions: actions,
    calculated_at: new Date().toISOString(),
  }
}

function calculateEngagement(m: EngagementMetrics): number {
  // Login frequency: 0 = 0pts, 1-2 = 30pts, 3-5 = 60pts, 6+ = 100pts
  let loginScore = 0
  if (m.login_frequency_monthly >= 6) loginScore = 100
  else if (m.login_frequency_monthly >= 3) loginScore = 60
  else if (m.login_frequency_monthly >= 1) loginScore = 30

  return (
    loginScore * 0.30 +
    m.email_open_rate * 0.25 +
    Math.min(m.contact_frequency_monthly * 20, 100) * 0.20 +
    m.training_participation_rate * 0.15 +
    m.cta_response_rate * 0.10
  )
}

function calculateSatisfaction(m: SatisfactionMetrics): number {
  // Normaliser NPS (-100 a 100) vers 0-100
  const npsNormalized = ((m.last_nps_score + 100) / 200) * 100

  // Penalite tickets critiques: -10 pts par ticket
  const ticketPenalty = Math.max(0, 100 - m.open_critical_tickets * 10)

  return (
    npsNormalized * 0.50 +
    m.csat_average * 0.30 +
    ticketPenalty * 0.10 +
    m.communication_sentiment * 0.10
  )
}

function calculateGrowth(m: GrowthMetrics): number {
  // Normaliser MRR change: -50% = 0, 0% = 50, +50% = 100
  const mrrScore = Math.max(0, Math.min(100, (m.mrr_change_pct + 50) * 1))

  // Normaliser traffic growth: meme logique
  const trafficScore = Math.max(0, Math.min(100, (m.traffic_growth_pct + 50) * 1))

  return (
    mrrScore * 0.40 +
    m.feature_adoption_pct * 0.30 +
    trafficScore * 0.20 +
    m.upsell_score * 0.10
  )
}

function getHealthLevel(score: number): {
  color: 'vert' | 'jaune' | 'orange' | 'rouge'
  status: 'excellent' | 'bon' | 'at_risk' | 'danger' | 'critique'
} {
  if (score >= 80) return { color: 'vert', status: 'excellent' }
  if (score >= 60) return { color: 'jaune', status: 'bon' }
  if (score >= 50) return { color: 'orange', status: 'at_risk' }
  if (score >= 30) return { color: 'orange', status: 'danger' }
  return { color: 'rouge', status: 'critique' }
}

function calculateChurnProbability(
  totalScore: number,
  components: HealthScoreComponents
): number {
  // Modele simplifie : inverse du health score + signaux aggravants
  let baseProbability = Math.max(0, 100 - totalScore)

  // Aggravants
  if (components.satisfaction.last_nps_score < 0) baseProbability += 15
  if (components.engagement.login_frequency_monthly === 0) baseProbability += 20
  if (components.satisfaction.open_critical_tickets > 2) baseProbability += 10
  if (components.growth.mrr_change_pct < -20) baseProbability += 10

  return Math.min(baseProbability, 100)
}

function getRecommendedActions(
  score: number,
  color: string,
  components: HealthScoreComponents
): string[] {
  const actions: string[] = []

  if (color === 'vert') {
    actions.push('Candidat programme referral')
    actions.push('Evaluer opportunite upsell')
    actions.push('Demander avis Google/Trustpilot')
  }

  if (color === 'jaune') {
    actions.push('Planifier check-in proactif')
    actions.push('Envoyer contenu de valeur (case study, best practice)')
    if (components.engagement.login_frequency_monthly < 3)
      actions.push('Email re-engagement : rappeler les features non utilisees')
  }

  if (color === 'orange') {
    actions.push('URGENT : Planifier appel CSM dans les 48h')
    actions.push('Proposer webinaire/formation gratuite')
    if (components.satisfaction.open_critical_tickets > 0)
      actions.push('Resoudre tickets critiques en priorite')
    actions.push('Offrir credits service ou discount renewal')
  }

  if (color === 'rouge') {
    actions.push('CRITIQUE : Intervention executive immediate')
    actions.push('Escalade a Jonathan')
    actions.push('Plan remediation formalise dans les 24h')
    actions.push('Envisager offre exceptionnelle (discount, services gratuits)')
    actions.push('Decision : fight ou accept churn')
  }

  return actions
}
```

---

## 6. NPS/CSAT AUTOMATISE

```typescript
// ============================================================
// NPS/CSAT AUTOMATISE
// ============================================================

interface SurveyConfig {
  type: 'nps' | 'csat' | 'ces'
  timing: string                  // Expression cron ou event trigger
  channel: 'email' | 'in_app'
  tool: 'typeform' | 'surveymonkey'
}

const SURVEY_SCHEDULE: SurveyConfig[] = [
  // CSAT apres chaque phase (spec, design, dev, UAT)
  { type: 'csat', timing: 'on_phase_complete', channel: 'email', tool: 'typeform' },
  // CES a la fin du projet
  { type: 'ces', timing: 'on_project_delivery', channel: 'email', tool: 'typeform' },
  // NPS 30 jours post-livraison
  { type: 'nps', timing: '30_days_post_delivery', channel: 'email', tool: 'typeform' },
  // NPS trimestriel
  { type: 'nps', timing: 'quarterly', channel: 'email', tool: 'typeform' },
]

async function handleNPSResponse(
  clientId: string,
  score: number,
  comment: string
): Promise<void> {
  const category = score >= 9 ? 'promoteur' : score >= 7 ? 'passif' : 'detracteur'

  // Sauvegarder en BDD
  await db.saveSurveyResponse({
    client_id: clientId,
    type: 'nps',
    score,
    comment,
    category,
    responded_at: new Date().toISOString(),
  })

  // Actions automatiques selon le score
  switch (category) {
    case 'promoteur':
      // Tag referral candidate
      await crmService.addTag(clientId, 'referral_candidate')
      // Programmer demande d'avis (sous-agent 10d)
      await reviewQueue.add(`review-request-${clientId}`, {
        client_id: clientId,
        nps_score: score,
        delay: 7 * 24 * 60 * 60 * 1000, // 7 jours apres
      })
      // Evaluer upsell (sous-agent 10b)
      await upsellQueue.add(`upsell-eval-${clientId}`, {
        client_id: clientId,
        trigger: 'nps_promoter',
      })
      break

    case 'passif':
      // Tag at-risk monitoring
      await crmService.addTag(clientId, 'nps_passif')
      // Email follow-up : "Que pouvons-nous ameliorer ?"
      await emailService.send({
        to: (await db.getClient(clientId)).email,
        subject: 'Comment pouvons-nous passer de bien a excellent ?',
        template: 'nps_passif_followup',
        data: { comment },
      })
      break

    case 'detracteur':
      // Alert immediate
      await crmService.addTag(clientId, 'nps_detracteur')
      await slack.send('#csm-urgent', {
        text: `ALERTE NPS : Detracteur (score ${score}) - Client ${clientId}\nCommentaire: ${comment}`,
      })
      // Intervention dans les 24h
      await crmService.createTask({
        type: 'call',
        priority: 'urgent',
        assignee: 'csm_manager',
        description: `Appel detracteur NPS ${score} - ${comment}`,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      break
  }
}
```

---

## 7. DETECTION CHURN AUTOMATIQUE

**7 signaux de churn avec delai estime :**

| Signal | Delai avant churn | Severite | Trigger automatique |
|---|---|---|---|
| Silence radio (60+ jours) | 60-120 jours | Critique | Email + SMS + appel executive |
| Baisse usage 40%+ | 45-60 jours | Haute | Alert CSM + appel |
| Spike support (x3) | 30-45 jours | Haute | QA review + fix |
| Retard paiement 15+ jours | 30 jours | Moyenne | Rappel automatique |
| NPS < 6 | 30-90 jours | Moyenne | Intervention 24h |
| Plaintes repetees | 15-30 jours | Moyenne | Escalade + fix |
| Health Score chute > 20 pts/30j | 60-90 jours | Haute | Alert + intervention 48h |
