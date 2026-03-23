# SOUS-AGENT 6b — LINKEDIN PASSIF
**Agent parent** : AGENT-6-MASTER.md

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing

---

## 1. MISSION

Le sous-agent LinkedIn Passif maintient une presence discrete dans le flux du prospect en likant et commentant ses publications LinkedIn. L'objectif est de garder Axiom dans le radar du prospect sans etre intrusif, et de creer un sentiment de familiarite pour quand le prospect sera pret a avancer.

## 2. PRINCIPES

- **Passif = pas de messages directs** : Uniquement likes et comments publics, jamais de DM non sollicites
- **Naturel** : Les interactions doivent sembler authentiques, pas automatisees
- **Anti-spam** : Maximum 3 interactions/semaine par prospect, jamais 2 le meme jour
- **Combine avec email** : Si un prospect reagit a un like/comment ET ouvre un email, score boosté
- **Via Waalaxy** : Utilise l'abonnement Waalaxy existant pour l'automatisation

## 3. PROCESSUS DETAILLE

```
1. Charger les prospects actifs en nurture ayant un profil LinkedIn
     |
2. Recuperer les publications recentes (via Waalaxy ou scraping LinkedIn)
     |
3. Filtrer les publications pertinentes (business, pas perso)
     |
4. Pour chaque publication pertinente :
     |-- Verifier quotas anti-spam (max 3/semaine, pas 2 meme jour)
     |-- Choisir action : like seul (70%) ou like + comment (30%)
     |-- Si comment : generer via Claude API (court, pertinent, naturel)
     |-- Executer via Waalaxy API
     |
5. Logger l'interaction et mettre a jour le score
     |
6. Monitorer les reactions du prospect (accepte-t-il le comment, repond-il ?)
```

## 4. CODE TYPESCRIPT COMPLET

```typescript
import { Queue, Worker, Job } from 'bullmq'
import { Anthropic } from '@anthropic-ai/sdk'
import { pool } from '../database/connection'

// === CONFIGURATION ===

const LINKEDIN_PASSIVE_CONFIG = {
  max_interactions_per_week: 3,
  min_hours_between_interactions: 24,
  like_to_comment_ratio: 0.7,         // 70% like seul, 30% like + comment
  comment_max_words: 30,
  scan_frequency_hours: 12,            // Scanner les posts 2x/jour
  blackout_hours: { start: 22, end: 7 }, // Pas d'interactions entre 22h et 7h
  max_prospects_per_scan: 50,
  waalaxy_rate_limit_per_minute: 5,
}

// === TYPES ===

interface LinkedInEngagementJob {
  type: 'SCAN_POSTS' | 'ENGAGE_POST'
  prospect_id?: string
  post_data?: LinkedInPost
  action: 'like' | 'like_and_comment'
}

interface LinkedInPost {
  post_id: string
  post_url: string
  author_name: string
  author_linkedin_url: string
  content_preview: string
  published_at: string
  post_type: 'text' | 'article' | 'image' | 'video' | 'poll' | 'document'
  engagement: {
    likes: number
    comments: number
    shares: number
  }
}

interface LinkedInInteractionRecord {
  prospect_id: string
  post_id: string
  action: 'like' | 'comment' | 'like_and_comment'
  comment_text: string | null
  executed_at: string
}

// === QUEUE ===

const linkedInPassiveQueue = new Queue('nurturer-linkedin-passive', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
    attempts: 2,
    backoff: { type: 'fixed', delay: 300000 }, // 5 min entre retries
  }
})

// === SCANNER PERIODIQUE DES POSTS ===

// Cron job: toutes les 12 heures (9h et 15h)
async function scanProspectPosts(): Promise<void> {
  console.log('[6b] Scan des posts LinkedIn des prospects en nurture...')

  // 1. Charger les prospects actifs avec un profil LinkedIn
  const prospects = await pool.query(`
    SELECT np.prospect_id, p.prenom, p.nom, p.linkedin_url, p.entreprise_nom,
           np.segment, np.engagement_score_current
    FROM nurture_prospects np
    JOIN prospects p ON p.prospect_id = np.prospect_id
    WHERE np.nurture_status IN ('ACTIVE', 'RE_ENGAGED')
      AND p.linkedin_url IS NOT NULL
      AND np.consent_status != 'OPTED_OUT'
    ORDER BY np.engagement_score_current DESC
    LIMIT $1
  `, [LINKEDIN_PASSIVE_CONFIG.max_prospects_per_scan])

  for (const prospect of prospects.rows) {
    // 2. Verifier les quotas
    const canInteract = await checkLinkedInQuota(prospect.prospect_id)
    if (!canInteract) continue

    // 3. Recuperer les posts recents via Waalaxy
    const recentPosts = await getRecentLinkedInPosts(prospect.linkedin_url)

    // 4. Filtrer les posts pertinents
    const relevantPosts = filterRelevantPosts(recentPosts)

    if (relevantPosts.length > 0) {
      // Prendre le post le plus recent et pertinent
      const targetPost = relevantPosts[0]

      // Decider action : like ou like + comment
      const action = Math.random() < LINKEDIN_PASSIVE_CONFIG.like_to_comment_ratio
        ? 'like' : 'like_and_comment'

      // Ajouter a la queue
      await linkedInPassiveQueue.add(
        `linkedin-engage-${prospect.prospect_id}`,
        {
          type: 'ENGAGE_POST',
          prospect_id: prospect.prospect_id,
          post_data: targetPost,
          action
        },
        {
          // Ajouter un delai aleatoire pour sembler naturel (1-6 heures)
          delay: Math.floor(Math.random() * 5 * 3600000) + 3600000
        }
      )
    }
  }
}

// === VERIFICATION DES QUOTAS ANTI-SPAM ===

async function checkLinkedInQuota(prospect_id: string): Promise<boolean> {
  // Verifier le nombre d'interactions cette semaine
  const weeklyCount = await pool.query(`
    SELECT COUNT(*) as count
    FROM nurture_interactions
    WHERE prospect_id = $1
      AND interaction_type IN ('LINKEDIN_LIKE', 'LINKEDIN_COMMENT')
      AND created_at >= NOW() - INTERVAL '7 days'
  `, [prospect_id])

  if (parseInt(weeklyCount.rows[0].count) >= LINKEDIN_PASSIVE_CONFIG.max_interactions_per_week) {
    return false
  }

  // Verifier le delai minimum depuis la derniere interaction
  const lastInteraction = await pool.query(`
    SELECT created_at
    FROM nurture_interactions
    WHERE prospect_id = $1
      AND interaction_type IN ('LINKEDIN_LIKE', 'LINKEDIN_COMMENT')
    ORDER BY created_at DESC
    LIMIT 1
  `, [prospect_id])

  if (lastInteraction.rows.length > 0) {
    const hoursSince = (Date.now() - new Date(lastInteraction.rows[0].created_at).getTime()) / 3600000
    if (hoursSince < LINKEDIN_PASSIVE_CONFIG.min_hours_between_interactions) {
      return false
    }
  }

  // Verifier les heures de blackout
  const now = new Date()
  const hour = now.getHours()
  if (hour >= LINKEDIN_PASSIVE_CONFIG.blackout_hours.start ||
      hour < LINKEDIN_PASSIVE_CONFIG.blackout_hours.end) {
    return false
  }

  return true
}

// === FILTRAGE DES POSTS PERTINENTS ===

function filterRelevantPosts(posts: LinkedInPost[]): LinkedInPost[] {
  return posts.filter(post => {
    // Exclure les posts trop vieux (> 7 jours)
    const postAge = (Date.now() - new Date(post.published_at).getTime()) / 86400000
    if (postAge > 7) return false

    // Exclure les reposts sans contenu (shares simples)
    if (!post.content_preview || post.content_preview.length < 50) return false

    // Exclure les posts trop personnels (anniversaires, etc.)
    const personalKeywords = [
      'anniversaire', 'birthday', 'vacances', 'holiday',
      'personnel', 'famille', 'family', 'rip', 'deces'
    ]
    const contentLower = post.content_preview.toLowerCase()
    if (personalKeywords.some(kw => contentLower.includes(kw))) return false

    // Privilegier les posts business/tech
    const businessKeywords = [
      'digital', 'web', 'site', 'ecommerce', 'shopify', 'marketing',
      'ia', 'ai', 'data', 'tech', 'startup', 'croissance', 'growth',
      'strategie', 'innovation', 'transformation', 'business', 'entreprise',
      'accessibilite', 'rgaa', 'rgpd', 'tracking', 'analytics',
      'mobile', 'app', 'flutter', 'developpement', 'recrutement'
    ]
    const isBusinessRelevant = businessKeywords.some(kw => contentLower.includes(kw))

    return isBusinessRelevant
  }).sort((a, b) => {
    // Trier par pertinence (nombre d'engagement) puis par recence
    const scoreA = a.engagement.likes + a.engagement.comments * 3
    const scoreB = b.engagement.likes + b.engagement.comments * 3
    return scoreB - scoreA
  })
}

// === WORKER D'ENGAGEMENT ===

const linkedInPassiveWorker = new Worker('nurturer-linkedin-passive', async (job: Job<LinkedInEngagementJob>) => {
  if (job.data.type !== 'ENGAGE_POST') return

  const { prospect_id, post_data, action } = job.data
  if (!prospect_id || !post_data) throw new Error('Missing data')

  console.log(`[6b] LinkedIn ${action}: prospect=${prospect_id}, post=${post_data.post_id}`)

  // Double-check quota (peut avoir change depuis la planification)
  const canInteract = await checkLinkedInQuota(prospect_id)
  if (!canInteract) {
    return { skipped: true, reason: 'quota_exceeded' }
  }

  // 1. Like le post via Waalaxy
  await waalaxyLikePost(post_data.post_url)

  // Logger le like
  await logNurtureInteraction({
    prospect_id,
    interaction_type: 'LINKEDIN_LIKE',
    canal: 'linkedin',
    details: {
      post_id: post_data.post_id,
      post_url: post_data.post_url,
      post_content_preview: post_data.content_preview.substring(0, 200)
    },
    score_delta: 1,
    score_after: 0  // Sera calcule par updateEngagementScore
  })
  await updateEngagementScore(prospect_id, 'LINKEDIN_LIKE', 1)

  // 2. Si like + comment, generer et poster un commentaire
  if (action === 'like_and_comment') {
    const prospect = await loadNurtureProspect(prospect_id)
    if (!prospect) return

    const comment = await generateLinkedInComment(post_data, prospect)

    if (comment) {
      await waalaxyCommentPost(post_data.post_url, comment)

      await logNurtureInteraction({
        prospect_id,
        interaction_type: 'LINKEDIN_COMMENT',
        canal: 'linkedin',
        details: {
          post_id: post_data.post_id,
          post_url: post_data.post_url,
          comment_text: comment
        },
        score_delta: 3,
        score_after: 0
      })
      await updateEngagementScore(prospect_id, 'LINKEDIN_COMMENT', 3)
    }
  }

  // 3. Mettre a jour les compteurs
  await pool.query(`
    UPDATE nurture_prospects SET
      linkedin_interactions = linkedin_interactions + 1,
      last_interaction_at = NOW(),
      updated_at = NOW()
    WHERE prospect_id = $1
  `, [prospect_id])

  return { success: true, action, post_id: post_data.post_id }
}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 1,  // Sequentiel pour respecter les rate limits
  limiter: {
    max: LINKEDIN_PASSIVE_CONFIG.waalaxy_rate_limit_per_minute,
    duration: 60000
  }
})

// === GENERATION DE COMMENTAIRES VIA CLAUDE ===

const anthropic = new Anthropic()

async function generateLinkedInComment(
  post: LinkedInPost,
  prospect: NurtureProspectRecord
): Promise<string | null> {

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Genere un commentaire LinkedIn court et naturel pour ce post.

POST de ${post.author_name}:
"${post.content_preview.substring(0, 500)}"

CONTEXTE: Je suis Jonathan, fondateur d'un studio dev web IA-augmente. Le commentaire doit:
- Faire 15-30 mots maximum
- Etre pertinent par rapport au contenu du post
- Apporter un avis ou un complement, pas juste "super post"
- Ne PAS mentionner mon entreprise ou mes services
- Sembler 100% naturel et humain
- Etre en francais
- Pas d'emoji excessif (1 max, optionnel)
- Ne PAS commencer par "Super" ou "Bravo"

Retourne UNIQUEMENT le commentaire, rien d'autre. Si le post n'est pas pertinent pour un commentaire business, retourne "SKIP".`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const comment = text.trim()

  if (comment === 'SKIP' || comment.length < 10 || comment.length > 300) {
    return null
  }

  return comment
}

// === INTEGRATION WAALAXY ===

async function waalaxyLikePost(post_url: string): Promise<void> {
  // Appel API Waalaxy pour liker un post
  // Waalaxy gere l'execution via le navigateur
  const response = await fetch('https://api.waalaxy.com/v1/actions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'like_post',
      post_url,
      delay_seconds: Math.floor(Math.random() * 30) + 5 // Delai aleatoire 5-35s
    })
  })

  if (!response.ok) {
    throw new Error(`Waalaxy like failed: ${response.status} ${await response.text()}`)
  }
}

async function waalaxyCommentPost(post_url: string, comment: string): Promise<void> {
  const response = await fetch('https://api.waalaxy.com/v1/actions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'comment_post',
      post_url,
      comment,
      delay_seconds: Math.floor(Math.random() * 60) + 10 // Delai 10-70s apres le like
    })
  })

  if (!response.ok) {
    throw new Error(`Waalaxy comment failed: ${response.status} ${await response.text()}`)
  }
}

async function getRecentLinkedInPosts(linkedin_url: string): Promise<LinkedInPost[]> {
  const response = await fetch(`https://api.waalaxy.com/v1/profiles/${encodeURIComponent(linkedin_url)}/posts`, {
    headers: {
      'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`
    }
  })

  if (!response.ok) return []

  const data = await response.json()
  return data.posts || []
}

// === GESTION DES ERREURS ===

linkedInPassiveWorker.on('failed', async (job, err) => {
  console.error(`[6b] LinkedIn engagement failed: job=${job?.id}, error=${err.message}`)

  // Si erreur rate limit Waalaxy, attendre plus longtemps
  if (err.message.includes('429') || err.message.includes('rate_limit')) {
    console.warn('[6b] Rate limit Waalaxy atteint, pause de 30 minutes')
    await linkedInPassiveQueue.pause()
    setTimeout(() => linkedInPassiveQueue.resume(), 30 * 60 * 1000)
  }
})
```

## 5. METRIQUES SOUS-AGENT 6b

```typescript
interface LinkedInPassiveMetrics {
  periode: string
  total_likes: number
  total_comments: number
  prospects_engages: number
  posts_scannes: number
  posts_filtres: number           // Posts rejetes par les filtres
  taux_comment_genere: number     // % de tentatives de comment reussies
  interactions_par_prospect_semaine: number
  par_segment: Record<string, {
    likes: number
    comments: number
  }>
}
```

---

**FIN DES SPECIFICATIONS SOUS-AGENT 6b — LINKEDIN PASSIF**
