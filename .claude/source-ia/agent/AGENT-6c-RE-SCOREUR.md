# SOUS-AGENT 6c — RE-SCOREUR PERIODIQUE
**Agent parent** : AGENT-6-MASTER.md

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing

---

## 1. MISSION

Le sous-agent Re-Scoreur re-evalue periodiquement les prospects en nurturing en re-interrogeant les sources de signaux business (les memes que l'Agent 1 VEILLEUR) et en integrant le score d'engagement accumule. Il reclassifie les prospects (COLD->WARM->HOT) et declenche un re-routing quand un prospect atteint le seuil HOT.

## 2. PRINCIPES

- **Deux types de triggers** : Periodiques (mensuel pour tous) et immediats (visite site, reponse email, clic pricing)
- **Sources de signaux** : Memes sources que l'Agent 1 (recrutement, levees, technos, contrats publics) + signaux d'engagement nurture
- **Reclassification** : Le score combine signaux business (poids 60%) + engagement nurture (poids 40%)
- **Handoff vers Agent 3** : Quand un prospect passe HOT, il est renvoye au SCOREUR pour re-routing dans le pipeline actif

## 3. PROCESSUS DETAILLE

```
TRIGGER PERIODIQUE (mensuel) :
  1. Selectionner tous les prospects ACTIVE ou PAUSED en nurture
  2. Pour chaque prospect :
     a. Re-interroger les sources de signaux business
        - Recrutement (Welcome to the Jungle, Indeed)
        - Levees de fonds (Dealroom, BPI France)
        - Stack techno (BuiltWith, Wappalyzer)
        - Contrats publics (BOAMP, si collectivite)
        - Actualites (Google News, presse sectorielle)
     b. Calculer le nouveau score business
     c. Combiner avec le score d'engagement nurture
     d. Recalculer la categorie (HOT/WARM/COLD)
     e. Si reclassification → actions appropriees

TRIGGER IMMEDIAT :
  - Visite page pricing → re-score immediat
  - Reponse email nurture → classifier + re-score
  - Download contenu → re-score
  - 3+ interactions en 7 jours → re-score
```

## 4. CODE TYPESCRIPT COMPLET

```typescript
import { Queue, Worker, Job } from 'bullmq'
import { pool } from '../database/connection'

// === CONFIGURATION ===

const RESCORE_CONFIG = {
  periodic_frequency_days: 30,      // Re-scoring mensuel
  warm_rescore_frequency_days: 14,  // Plus frequent pour les WARM
  business_signal_weight: 0.6,      // 60% du score final
  engagement_weight: 0.4,           // 40% du score final
  hot_threshold: 75,                // Score >= 75 → HOT
  warm_threshold: 40,               // Score >= 40 → WARM
  cold_threshold: 0,                // Score < 40 → COLD
  immediate_trigger_cooldown_hours: 24, // Pas plus d'un re-score immediat par 24h
  max_concurrent_rescores: 5,
}

// === TYPES ===

interface RescoreJob {
  type: 'PERIODIC' | 'IMMEDIATE'
  prospect_id: string
  trigger_reason: string
  trigger_data?: Record<string, unknown>
}

interface RescoreResult {
  prospect_id: string
  previous_score: number
  new_score: number
  previous_categorie: string
  new_categorie: string
  reclassified: boolean
  business_signals_found: BusinessSignal[]
  engagement_score: number
  combined_score: number
}

interface BusinessSignal {
  source: string
  type: string
  description: string
  score_impact: number
  detected_at: string
  url: string | null
}

// === QUEUE ===

const rescoreQueue = new Queue('nurturer-rescore', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  }
})

// === CRON JOB MENSUEL ===

async function triggerMonthlyRescore(): Promise<void> {
  console.log('[6c] Demarrage du re-scoring mensuel...')

  // Selectionner les prospects dont le re-score est du
  const prospects = await pool.query(`
    SELECT prospect_id, segment, scoring_categorie, engagement_score_current,
           next_rescore_at
    FROM nurture_prospects
    WHERE nurture_status IN ('ACTIVE', 'PAUSED', 'RE_ENGAGED')
      AND consent_status != 'OPTED_OUT'
      AND (next_rescore_at IS NULL OR next_rescore_at <= NOW())
    ORDER BY next_rescore_at ASC NULLS FIRST
  `)

  console.log(`[6c] ${prospects.rows.length} prospects a re-scorer`)

  for (const prospect of prospects.rows) {
    await rescoreQueue.add(
      `rescore-periodic-${prospect.prospect_id}`,
      {
        type: 'PERIODIC',
        prospect_id: prospect.prospect_id,
        trigger_reason: 'monthly_rescore'
      },
      {
        // Etaler les re-scores sur 24h pour ne pas surcharger les APIs
        delay: Math.floor(Math.random() * 86400000)
      }
    )
  }
}

// === TRIGGERS IMMEDIATS ===

async function triggerImmediateRescore(
  prospect_id: string,
  trigger_reason: string,
  trigger_data?: Record<string, unknown>
): Promise<void> {

  // Verifier le cooldown (pas plus d'un re-score immediat par 24h)
  const lastRescore = await pool.query(`
    SELECT created_at
    FROM nurture_interactions
    WHERE prospect_id = $1
      AND interaction_type = 'RESCORE'
      AND details->>'type' = 'IMMEDIATE'
    ORDER BY created_at DESC
    LIMIT 1
  `, [prospect_id])

  if (lastRescore.rows.length > 0) {
    const hoursSince = (Date.now() - new Date(lastRescore.rows[0].created_at).getTime()) / 3600000
    if (hoursSince < RESCORE_CONFIG.immediate_trigger_cooldown_hours) {
      console.log(`[6c] Cooldown re-score immediat pour ${prospect_id} (${hoursSince.toFixed(1)}h < ${RESCORE_CONFIG.immediate_trigger_cooldown_hours}h)`)
      return
    }
  }

  await rescoreQueue.add(
    `rescore-immediate-${prospect_id}`,
    {
      type: 'IMMEDIATE',
      prospect_id,
      trigger_reason,
      trigger_data
    },
    { priority: 1 } // Priorite haute pour les triggers immediats
  )
}

// === WORKER DE RE-SCORING ===

const rescoreWorker = new Worker('nurturer-rescore', async (job: Job<RescoreJob>) => {
  const { type, prospect_id, trigger_reason } = job.data

  console.log(`[6c] Re-scoring ${type}: prospect=${prospect_id}, reason=${trigger_reason}`)

  // 1. Charger le prospect
  const prospect = await loadNurtureProspect(prospect_id)
  if (!prospect) throw new Error(`Prospect ${prospect_id} non trouve`)

  // 2. Re-interroger les sources de signaux business
  const businessSignals = type === 'PERIODIC'
    ? await scanBusinessSignals(prospect)
    : [] // Les triggers immediats n'ont pas besoin de re-scanner

  // 3. Calculer le score business
  const businessScore = calculateBusinessScore(prospect, businessSignals)

  // 4. Calculer le score d'engagement (deja en base)
  const engagementScore = prospect.engagement_score_current

  // 5. Calculer le score combine
  const combinedScore = Math.round(
    businessScore * RESCORE_CONFIG.business_signal_weight +
    engagementScore * RESCORE_CONFIG.engagement_weight
  )

  // 6. Determiner la nouvelle categorie
  let newCategorie: string
  if (combinedScore >= RESCORE_CONFIG.hot_threshold) {
    newCategorie = 'HOT'
  } else if (combinedScore >= RESCORE_CONFIG.warm_threshold) {
    newCategorie = 'WARM'
  } else {
    newCategorie = 'COLD'
  }

  const reclassified = newCategorie !== prospect.scoring_categorie
  const promoted = reclassified && (
    (prospect.scoring_categorie === 'COLD' && newCategorie !== 'COLD') ||
    (prospect.scoring_categorie === 'WARM' && newCategorie === 'HOT')
  )

  // 7. Mettre a jour en base
  const nextRescoreInterval = newCategorie === 'WARM'
    ? RESCORE_CONFIG.warm_rescore_frequency_days
    : RESCORE_CONFIG.periodic_frequency_days

  await pool.query(`
    UPDATE nurture_prospects SET
      scoring_categorie = $1,
      engagement_score_current = $2,
      last_score_update = NOW(),
      next_rescore_at = NOW() + INTERVAL '${nextRescoreInterval} days',
      updated_at = NOW()
    WHERE prospect_id = $3
  `, [newCategorie, combinedScore, prospect_id])

  // 8. Logger l'interaction
  await logNurtureInteraction({
    prospect_id,
    interaction_type: 'RESCORE',
    canal: 'system',
    details: {
      type,
      trigger_reason,
      previous_score: prospect.engagement_score_current,
      new_score: combinedScore,
      business_score: businessScore,
      engagement_score: engagementScore,
      previous_categorie: prospect.scoring_categorie,
      new_categorie: newCategorie,
      business_signals_count: businessSignals.length,
      reclassified
    },
    score_delta: combinedScore - prospect.engagement_score_current,
    score_after: combinedScore
  })

  // 9. Si reclassifie HOT → renvoyer au SCOREUR (Agent 3)
  if (newCategorie === 'HOT' && promoted) {
    await handoffToScoreur(prospect, combinedScore, businessSignals, trigger_reason)

    // Mettre a jour le statut nurture
    await pool.query(`
      UPDATE nurture_prospects SET
        nurture_status = 'RECLASSIFIED_HOT',
        updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect_id])

    // Notification Slack
    await sendSlackNotification({
      channel: '#prospection-hot',
      text: `*Re-scoring HOT* : ${prospect.prenom} ${prospect.nom} (${prospect.entreprise_nom}) reclassifie HOT apres nurturing.\nScore: ${combinedScore}/100 | Raison: ${trigger_reason}\nRenvoye au Scoreur (Agent 3) pour re-routing.`,
      priority: 'high'
    })
  }

  // 10. Si reclassifie COLD -> WARM, ajuster la sequence nurture
  if (reclassified && prospect.scoring_categorie === 'COLD' && newCategorie === 'WARM') {
    // Accelerer la frequence des emails
    await pool.query(`
      UPDATE nurture_prospects SET
        current_sequence_type = 'WARM_NURTURE',
        next_rescore_at = NOW() + INTERVAL '${RESCORE_CONFIG.warm_rescore_frequency_days} days',
        updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect_id])
  }

  const result: RescoreResult = {
    prospect_id,
    previous_score: prospect.engagement_score_current,
    new_score: combinedScore,
    previous_categorie: prospect.scoring_categorie,
    new_categorie: newCategorie,
    reclassified,
    business_signals_found: businessSignals,
    engagement_score: engagementScore,
    combined_score: combinedScore
  }

  return result
}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: RESCORE_CONFIG.max_concurrent_rescores,
  limiter: { max: 10, duration: 60000 }
})

// === SCAN DES SIGNAUX BUSINESS ===

async function scanBusinessSignals(prospect: NurtureProspectRecord): Promise<BusinessSignal[]> {
  const signals: BusinessSignal[] = []
  const entreprise = prospect.entreprise_nom

  // 1. Recrutement (Welcome to the Jungle, Indeed)
  try {
    const recruitmentSignals = await scanRecruitmentSignals(entreprise)
    signals.push(...recruitmentSignals)
  } catch (err) {
    console.warn(`[6c] Erreur scan recrutement pour ${entreprise}:`, err)
  }

  // 2. Levees de fonds (Dealroom, BPI France)
  try {
    const fundingSignals = await scanFundingSignals(entreprise)
    signals.push(...fundingSignals)
  } catch (err) {
    console.warn(`[6c] Erreur scan levees pour ${entreprise}:`, err)
  }

  // 3. Stack techno (BuiltWith)
  try {
    const techSignals = await scanTechSignals(entreprise, prospect.segment)
    signals.push(...techSignals)
  } catch (err) {
    console.warn(`[6c] Erreur scan tech pour ${entreprise}:`, err)
  }

  // 4. Contrats publics (si collectivite)
  if (prospect.segment === 'COLLECTIVITES') {
    try {
      const publicSignals = await scanPublicContractSignals(entreprise)
      signals.push(...publicSignals)
    } catch (err) {
      console.warn(`[6c] Erreur scan contrats publics pour ${entreprise}:`, err)
    }
  }

  // 5. Actualites (Google News)
  try {
    const newsSignals = await scanNewsSignals(entreprise)
    signals.push(...newsSignals)
  } catch (err) {
    console.warn(`[6c] Erreur scan actualites pour ${entreprise}:`, err)
  }

  return signals
}

// === SCAN RECRUTEMENT ===

async function scanRecruitmentSignals(entreprise: string): Promise<BusinessSignal[]> {
  const signals: BusinessSignal[] = []

  // Welcome to the Jungle
  const wttjResponse = await fetch(
    `https://api.welcometothejungle.com/api/v1/organizations?query=${encodeURIComponent(entreprise)}`,
    { headers: { 'Accept': 'application/json' } }
  )

  if (wttjResponse.ok) {
    const data = await wttjResponse.json()
    if (data.organizations?.length > 0) {
      const org = data.organizations[0]
      const techJobs = (org.jobs || []).filter((j: any) =>
        /dev|web|digital|tech|data|marketing/i.test(j.name)
      )

      if (techJobs.length > 0) {
        signals.push({
          source: 'welcome_to_the_jungle',
          type: 'recrutement_tech',
          description: `${techJobs.length} offre(s) tech/digital active(s) chez ${entreprise}`,
          score_impact: techJobs.length >= 3 ? 15 : 8,
          detected_at: new Date().toISOString(),
          url: org.url || null
        })
      }
    }
  }

  // Indeed
  const indeedResponse = await fetch(
    `https://api.indeed.com/ads/apisearch?publisher=${process.env.INDEED_API_KEY}&q=${encodeURIComponent(entreprise + ' web developer')}&l=France&format=json`
  )

  if (indeedResponse.ok) {
    const data = await indeedResponse.json()
    if (data.totalResults > 0) {
      signals.push({
        source: 'indeed',
        type: 'recrutement_web',
        description: `${data.totalResults} offre(s) web/dev sur Indeed`,
        score_impact: 5,
        detected_at: new Date().toISOString(),
        url: null
      })
    }
  }

  return signals
}

// === SCAN LEVEES DE FONDS ===

async function scanFundingSignals(entreprise: string): Promise<BusinessSignal[]> {
  const signals: BusinessSignal[] = []

  // Dealroom
  const dealroomResponse = await fetch(
    `https://api.dealroom.co/v1/companies?name=${encodeURIComponent(entreprise)}`,
    { headers: { 'Authorization': `Bearer ${process.env.DEALROOM_API_KEY}` } }
  )

  if (dealroomResponse.ok) {
    const data = await dealroomResponse.json()
    if (data.items?.length > 0) {
      const company = data.items[0]
      const recentRounds = (company.funding_rounds || []).filter((r: any) => {
        const roundDate = new Date(r.date)
        return (Date.now() - roundDate.getTime()) < 180 * 86400000 // Derniers 6 mois
      })

      if (recentRounds.length > 0) {
        const latestRound = recentRounds[0]
        signals.push({
          source: 'dealroom',
          type: 'levee_fonds',
          description: `Levee de fonds recente: ${latestRound.type} ${latestRound.amount ? `(${latestRound.amount}EUR)` : ''}`,
          score_impact: 20,
          detected_at: new Date().toISOString(),
          url: company.url || null
        })
      }
    }
  }

  return signals
}

// === SCAN STACK TECHNO ===

async function scanTechSignals(entreprise: string, segment: string): Promise<BusinessSignal[]> {
  const signals: BusinessSignal[] = []

  // BuiltWith
  const bwResponse = await fetch(
    `https://api.builtwith.com/v21/api.json?KEY=${process.env.BUILTWITH_API_KEY}&LOOKUP=${encodeURIComponent(entreprise)}`
  )

  if (bwResponse.ok) {
    const data = await bwResponse.json()
    const techs = data.Results?.[0]?.Result?.Paths?.[0]?.Technologies || []

    // Detecter des signaux pertinents selon le segment
    const oldTechs = techs.filter((t: any) =>
      /wordpress|wix|squarespace|prestashop|magento/i.test(t.Name)
    )

    if (oldTechs.length > 0) {
      signals.push({
        source: 'builtwith',
        type: 'techno_obsolete',
        description: `Utilise ${oldTechs.map((t: any) => t.Name).join(', ')} — potentiel de migration`,
        score_impact: 10,
        detected_at: new Date().toISOString(),
        url: null
      })
    }

    // Si Shopify detect, pertinent pour segment ECOMMERCE
    const hasShopify = techs.some((t: any) => /shopify/i.test(t.Name))
    if (hasShopify && segment === 'ECOMMERCE_SHOPIFY') {
      signals.push({
        source: 'builtwith',
        type: 'shopify_detected',
        description: 'Utilise Shopify — potentiel de services avances',
        score_impact: 8,
        detected_at: new Date().toISOString(),
        url: null
      })
    }
  }

  return signals
}

// === SCAN CONTRATS PUBLICS ===

async function scanPublicContractSignals(entreprise: string): Promise<BusinessSignal[]> {
  const signals: BusinessSignal[] = []

  // BOAMP (Bulletin Officiel des Annonces de Marches Publics)
  const boampResponse = await fetch(
    `https://api.boamp.fr/api/v1/annonces?q=${encodeURIComponent(entreprise + ' web')}&date_min=${sixMonthsAgo()}`
  )

  if (boampResponse.ok) {
    const data = await boampResponse.json()
    if (data.annonces?.length > 0) {
      signals.push({
        source: 'boamp',
        type: 'marche_public',
        description: `${data.annonces.length} marche(s) public(s) web detecte(s)`,
        score_impact: 15,
        detected_at: new Date().toISOString(),
        url: null
      })
    }
  }

  return signals
}

// === SCAN ACTUALITES ===

async function scanNewsSignals(entreprise: string): Promise<BusinessSignal[]> {
  const signals: BusinessSignal[] = []

  // Google Custom Search News
  const newsResponse = await fetch(
    `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${encodeURIComponent(entreprise + ' digital transformation')}&dateRestrict=m3&num=5`
  )

  if (newsResponse.ok) {
    const data = await newsResponse.json()
    if (data.items?.length > 0) {
      const relevantNews = data.items.filter((item: any) =>
        /digital|web|transform|innovation|lancement|partenariat/i.test(item.title + ' ' + item.snippet)
      )

      if (relevantNews.length > 0) {
        signals.push({
          source: 'google_news',
          type: 'actualite_business',
          description: `${relevantNews.length} actualite(s) pertinente(s): "${relevantNews[0].title}"`,
          score_impact: 5,
          detected_at: new Date().toISOString(),
          url: relevantNews[0].link || null
        })
      }
    }
  }

  return signals
}

// === CALCUL DU SCORE BUSINESS ===

function calculateBusinessScore(
  prospect: NurtureProspectRecord,
  signals: BusinessSignal[]
): number {
  let score = 0

  // Score de base selon la categorie precedente
  switch (prospect.scoring_categorie) {
    case 'HOT': score = 60; break
    case 'WARM': score = 35; break
    case 'COLD': score = 15; break
  }

  // Ajouter l'impact des signaux
  for (const signal of signals) {
    score += signal.score_impact
  }

  // Normaliser sur 0-100
  return Math.min(100, Math.max(0, score))
}

// === HANDOFF VERS AGENT 3 (SCOREUR) ===

interface ScoreurResubmission {
  prospect_id: string
  lead_id: string
  source: 'agent_6_nurtureur'
  resubmission_reason: 'RECLASSIFIED_HOT'
  nurture_data: {
    engagement_score: number
    combined_score: number
    nurture_duration_days: number
    emails_nurture_received: number
    emails_opened: number
    emails_clicked: number
    linkedin_interactions: number
    content_downloaded: number
    business_signals: BusinessSignal[]
    trigger_reason: string
    parcours_etape: string
  }
  prospect: {
    prenom: string
    nom: string
    email: string
    entreprise_nom: string
    poste: string
    segment: string
  }
  metadata: {
    agent: 'agent_6_nurtureur'
    resubmitted_at: string
    nurtureur_version: string
  }
}

async function handoffToScoreur(
  prospect: NurtureProspectRecord,
  combinedScore: number,
  signals: BusinessSignal[],
  trigger_reason: string
): Promise<void> {

  const nurtureDurationDays = Math.ceil(
    (Date.now() - new Date(prospect.created_at).getTime()) / 86400000
  )

  const resubmission: ScoreurResubmission = {
    prospect_id: prospect.prospect_id,
    lead_id: prospect.lead_id,
    source: 'agent_6_nurtureur',
    resubmission_reason: 'RECLASSIFIED_HOT',
    nurture_data: {
      engagement_score: prospect.engagement_score_current,
      combined_score: combinedScore,
      nurture_duration_days: nurtureDurationDays,
      emails_nurture_received: prospect.emails_nurture_sent,
      emails_opened: prospect.emails_opened,
      emails_clicked: prospect.emails_clicked,
      linkedin_interactions: prospect.linkedin_interactions,
      content_downloaded: prospect.content_downloaded,
      business_signals: signals,
      trigger_reason,
      parcours_etape: prospect.parcours_etape
    },
    prospect: {
      prenom: prospect.prenom,
      nom: prospect.nom,
      email: prospect.email,
      entreprise_nom: prospect.entreprise_nom,
      poste: prospect.poste,
      segment: prospect.segment
    },
    metadata: {
      agent: 'agent_6_nurtureur',
      resubmitted_at: new Date().toISOString(),
      nurtureur_version: '1.0.0'
    }
  }

  // Envoyer au Scoreur via BullMQ
  const scoreurQueue = new Queue('scoreur-pipeline', {
    connection: { host: 'localhost', port: 6379 }
  })

  await scoreurQueue.add(
    `rescore-from-nurture-${prospect.prospect_id}`,
    resubmission,
    { priority: 2 } // Haute priorite car HOT
  )

  console.log(`[6c] Prospect ${prospect.prospect_id} renvoye au Scoreur (Agent 3) comme HOT`)
}

// === GESTION DES ERREURS ===

rescoreWorker.on('failed', async (job, err) => {
  console.error(`[6c] Re-scoring failed: job=${job?.id}, error=${err.message}`)
})
```

## 5. METRIQUES SOUS-AGENT 6c

```typescript
interface RescoreMetrics {
  periode: string
  total_rescores: number
  rescores_periodiques: number
  rescores_immediats: number
  reclassifications: {
    cold_to_warm: number
    cold_to_hot: number
    warm_to_hot: number
    warm_to_cold: number         // Degradation possible
  }
  signaux_detectes: {
    recrutement: number
    levee_fonds: number
    techno: number
    contrats_publics: number
    actualites: number
  }
  score_moyen_avant: number
  score_moyen_apres: number
  prospects_renvoyes_pipeline: number  // HOT renvoyes au Scoreur
}
```

---

**FIN DES SPECIFICATIONS SOUS-AGENT 6c — RE-SCOREUR PERIODIQUE**
