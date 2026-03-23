# AGENT 6 -- NURTUREUR : SPECIFICATIONS TECHNIQUES COMPLETES

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B multicanal (Email + LinkedIn)
**Public :** Jonathan Dewaele, Marty Wong, equipe tech Univile

---

## TABLE DES MATIERES

1. [Mission](#1-mission)
2. [Input : Schema JSON recu de l'Agent 5](#2-input--schema-json-recu-de-lagent-5)
3. [Sous-Agents](#3-sous-agents)
4. [Sequences nurture completes par segment](#4-sequences-nurture-completes-par-segment)
5. [Contenu par segment](#5-contenu-par-segment)
6. [Re-engagement des leads inactifs](#6-re-engagement-des-leads-inactifs)
7. [Sunset Policy](#7-sunset-policy)
8. [Metriques](#8-metriques)
9. [Scoring d'engagement](#9-scoring-dengagement)
10. [Output : donnees produites](#10-output--donnees-produites)
11. [Couts](#11-couts)
12. [Verification de coherence](#12-verification-de-coherence)

---

## 1. MISSION

### 1.1 Definition

L'Agent 6 (NURTUREUR) est le **gardien de la relation long terme** du pipeline Axiom Marketing. Il prend en charge les prospects qui n'ont PAS converti apres la sequence initiale de l'Agent 5 (SUIVEUR) et maintient un lien actif avec eux via du contenu de valeur, de l'engagement LinkedIn passif, et un re-scoring periodique. Son objectif est de transformer des prospects COLD ou WARM en prospects HOT via un nurturing patient et methodique, sans jamais etre intrusif.

Le NURTUREUR ne force pas la vente. Il eduque, apporte de la valeur, et attend le bon moment. Quand un prospect manifeste un nouveau signal d'interet ou atteint un seuil d'engagement, il est reclassifie et renvoye dans le pipeline actif.

### 1.2 Responsabilites exactes

| Responsabilite | Agent 6 fait | Autres agents font |
|---|---|---|
| **Sequences nurture email** | Envoie du contenu comportemental sur la duree (semaines/mois) | Agent 5 gere les sequences de prospection initiale (jours) |
| **Engagement LinkedIn passif** | Likes, comments sur posts des prospects | Agent 5 gere les connexions/messages LinkedIn directs |
| **Re-scoring periodique** | Re-interroge les signaux mensuellement, recalcule le score | Agent 3 fait le scoring initial |
| **Gestion inactifs** | Workflows de re-engagement, sunset policy, nettoyage | -- |
| **Reclassification** | Promotionne COLD->WARM->HOT quand engagement suffisant | Agent 3 recoit les leads re-scores pour re-routing |
| **Conformite RGPD** | Opt-out, droit a l'oubli, retention limitee | -- |
| **Metriques nurturing** | Produit des KPIs specifiques au nurturing | Agent 7 les analyse et les agrege |

### 1.3 Ce que le Nurtureur ne fait PAS

- Ne fait PAS de prospection froide initiale (responsabilite Agents 1-5)
- Ne redige PAS les messages de prospection (responsabilite Agent 4 REDACTEUR)
- Ne score PAS les prospects initialement (responsabilite Agent 3 SCOREUR)
- Ne gere PAS les sequences initiales (responsabilite Agent 5 SUIVEUR)
- Ne produit PAS de rapports analytiques (responsabilite Agent 7 ANALYSTE)
- Ne prend PAS de decisions commerciales (responsabilite de Jonathan)

### 1.4 Position dans le pipeline

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
                                  ===========================  Agent 7 (ANALYSTE)
                                  |  AGENT 6 (NURTUREUR)    |       ^
                                  |  - Nurture email        |       |
                                  |  - LinkedIn passif      |       |
                                  |  - Re-scoring           |       |
                                  |  - Sunset policy        |       |
                                  ===========================       |
                                              |                     |
                                     +--------+--------+            |
                                     |        |        |            |
                                     v        v        v            |
                              Re-score   Metriques   Opt-out        |
                              vers       vers        RGPD           |
                              Agent 3    Agent 7 ----+              |
```

### 1.5 Distinction Agent 5 (SUIVEUR) vs Agent 6 (NURTUREUR)

| Aspect | Agent 5 (SUIVEUR) | Agent 6 (NURTUREUR) |
|---|---|---|
| **Temporalite** | Jours (sequence 2-4 semaines) | Semaines/mois (3-12 mois) |
| **Intention** | Obtenir une reponse | Maintenir la relation |
| **Ton** | Commercial direct | Educatif, valeur |
| **Frequence** | 4-6 emails en 3 semaines | 1-2 emails/semaine max |
| **Contenu** | Messages personnalises de vente | Contenu educatif, cas d'usage, insights |
| **Ratio valeur:promo** | ~1:1 | 3:1 minimum |
| **Canal principal** | Email + LinkedIn direct | Email nurture + LinkedIn passif |
| **Sortie** | Reponse ou handoff nurture | Re-scoring ou sunset |

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 5

### 2.1 Schema JSON complet (NurturerHandoff de l'Agent 5)

Le Nurtureur recoit ses prospects via la queue BullMQ `nurturer-pipeline`. Chaque job contient un objet `NurturerHandoff` envoye par l'Agent 5 quand une sequence se termine sans conversion.

```typescript
interface NurturerInput {
  prospect_id: string          // UUID v4 du prospect
  lead_id: string              // UUID v4 du lead original (Agent 1)

  // Raison du handoff depuis l'Agent 5
  handoff_reason: 'SEQUENCE_COMPLETED_NO_REPLY' | 'PAS_MAINTENANT' | 'INTERESTED_SOFT_NO_FOLLOWUP'

  // Historique de la sequence initiale (Agent 5)
  sequence_summary: {
    sequence_id: string        // ID unique de la sequence Agent 5
    steps_completed: number    // Nombre d'etapes completees (ex: 4/4)
    total_steps: number        // Nombre total d'etapes dans la sequence
    emails_sent: number        // Emails envoyes pendant la sequence
    linkedin_actions: number   // Actions LinkedIn pendant la sequence
    duration_days: number      // Duree totale de la sequence en jours
    replies: Array<{           // Reponses recues pendant la sequence
      category: string         // Classification: PAS_MAINTENANT, INTERESSE_SOFT, etc.
      date: string             // ISO 8601
    }>
  }

  // Recommandations de l'Agent 5 pour le nurturing
  nurturing_recommendations: {
    resume_date: string | null          // Date suggeree pour reprendre contact (ISO 8601)
    suggested_content_type: string      // 'case_study', 'blog', 'event', 'newsletter'
    last_signal: string                 // Dernier signal business detecte
    engagement_score: number            // 0-100 base sur les interactions de la sequence
  }

  // Donnees prospect completes
  prospect: {
    prenom: string
    nom: string
    email: string
    entreprise_nom: string
    poste: string
    segment: 'PME_METRO' | 'ECOMMERCE_SHOPIFY' | 'COLLECTIVITES' | 'STARTUPS' | 'AGENCES_WL'
    scoring_categorie: 'HOT' | 'WARM' | 'COLD'
  }

  // Metadata de provenance
  metadata: {
    agent: 'agent_5_suiveur'    // Toujours cet agent
    handoff_at: string          // ISO 8601 timestamp du handoff
    suiveur_version: string     // Version de l'Agent 5
  }
}
```

### 2.2 Validation de l'input

```typescript
import { z } from 'zod'

const NurturerInputSchema = z.object({
  prospect_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  handoff_reason: z.enum([
    'SEQUENCE_COMPLETED_NO_REPLY',
    'PAS_MAINTENANT',
    'INTERESTED_SOFT_NO_FOLLOWUP'
  ]),
  sequence_summary: z.object({
    sequence_id: z.string().min(1),
    steps_completed: z.number().int().min(0),
    total_steps: z.number().int().min(1),
    emails_sent: z.number().int().min(0),
    linkedin_actions: z.number().int().min(0),
    duration_days: z.number().int().min(0),
    replies: z.array(z.object({
      category: z.string(),
      date: z.string().datetime()
    }))
  }),
  nurturing_recommendations: z.object({
    resume_date: z.string().datetime().nullable(),
    suggested_content_type: z.string(),
    last_signal: z.string(),
    engagement_score: z.number().min(0).max(100)
  }),
  prospect: z.object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    email: z.string().email(),
    entreprise_nom: z.string().min(1),
    poste: z.string().min(1),
    segment: z.enum(['PME_METRO', 'ECOMMERCE_SHOPIFY', 'COLLECTIVITES', 'STARTUPS', 'AGENCES_WL']),
    scoring_categorie: z.enum(['HOT', 'WARM', 'COLD'])
  }),
  metadata: z.object({
    agent: z.literal('agent_5_suiveur'),
    handoff_at: z.string().datetime(),
    suiveur_version: z.string()
  })
})

// Fonction de validation a l'entree du pipeline
async function validateNurturerInput(data: unknown): Promise<NurturerInput> {
  try {
    const validated = NurturerInputSchema.parse(data)

    // Verifications logiques supplementaires
    if (validated.sequence_summary.steps_completed > validated.sequence_summary.total_steps) {
      throw new Error(
        `steps_completed (${validated.sequence_summary.steps_completed}) > total_steps (${validated.sequence_summary.total_steps})`
      )
    }

    if (validated.nurturing_recommendations.engagement_score < 0 ||
        validated.nurturing_recommendations.engagement_score > 100) {
      throw new Error(
        `engagement_score hors limites: ${validated.nurturing_recommendations.engagement_score}`
      )
    }

    // Verifier que la resume_date est dans le futur (si fournie)
    if (validated.nurturing_recommendations.resume_date) {
      const resumeDate = new Date(validated.nurturing_recommendations.resume_date)
      if (resumeDate < new Date()) {
        console.warn(`resume_date dans le passe: ${validated.nurturing_recommendations.resume_date}, sera ignore`)
      }
    }

    // Verifier la coherence du handoff_reason
    if (validated.handoff_reason === 'PAS_MAINTENANT' &&
        validated.sequence_summary.replies.length === 0) {
      throw new Error('PAS_MAINTENANT mais aucune reponse dans le summary — incoherent')
    }

    return validated as NurturerInput
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation NurturerInput echouee:', JSON.stringify(error.issues, null, 2))
      // Logger l'erreur pour audit
      await logValidationError({
        source: 'agent_5_suiveur',
        data_preview: JSON.stringify(data).substring(0, 500),
        errors: error.issues,
        timestamp: new Date().toISOString()
      })
    }
    throw error
  }
}
```

### 2.3 Routage initial selon le handoff_reason

```typescript
interface NurtureRouting {
  sequence_type: 'WARM_NURTURE' | 'COLD_NURTURE' | 'PAS_MAINTENANT_NURTURE'
  initial_delay_days: number
  content_strategy: string
  linkedin_engagement: boolean
  re_score_frequency_days: number
}

function routeNurtureProspect(input: NurturerInput): NurtureRouting {
  switch (input.handoff_reason) {
    case 'INTERESTED_SOFT_NO_FOLLOWUP':
      return {
        sequence_type: 'WARM_NURTURE',
        initial_delay_days: 7,       // Reprendre dans 1 semaine
        content_strategy: 'consideration',  // Deja interesse, contenu decision
        linkedin_engagement: true,
        re_score_frequency_days: 14   // Re-scorer toutes les 2 semaines
      }

    case 'PAS_MAINTENANT':
      return {
        sequence_type: 'PAS_MAINTENANT_NURTURE',
        initial_delay_days: calculateResumeDelay(input),
        content_strategy: 'awareness_to_consideration',
        linkedin_engagement: true,
        re_score_frequency_days: 30   // Re-scorer chaque mois
      }

    case 'SEQUENCE_COMPLETED_NO_REPLY':
      return {
        sequence_type: 'COLD_NURTURE',
        initial_delay_days: 21,       // Attendre 3 semaines avant de reprendre
        content_strategy: 'awareness',  // Reprendre au debut
        linkedin_engagement: true,
        re_score_frequency_days: 30   // Re-scorer chaque mois
      }
  }
}

function calculateResumeDelay(input: NurturerInput): number {
  // Si l'Agent 5 a fourni une resume_date, l'utiliser
  if (input.nurturing_recommendations.resume_date) {
    const resumeDate = new Date(input.nurturing_recommendations.resume_date)
    const now = new Date()
    const diffDays = Math.ceil((resumeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(diffDays, 7) // Minimum 7 jours
  }

  // Sinon, analyser les reponses pour deviner le timing
  const pasMaintenant = input.sequence_summary.replies.find(
    r => r.category === 'PAS_MAINTENANT'
  )

  if (pasMaintenant) {
    // Par defaut: reprendre dans 6 semaines apres un "pas maintenant"
    return 42
  }

  // Fallback: 30 jours
  return 30
}
```

### 2.4 Tables SQL pour le stockage nurture

```sql
-- Table principale des prospects en nurturing
CREATE TABLE IF NOT EXISTS nurture_prospects (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  lead_id UUID NOT NULL,

  -- Provenance
  handoff_reason VARCHAR(50) NOT NULL,
  handoff_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source_sequence_id VARCHAR(50) NOT NULL,

  -- Etat nurturing
  nurture_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (nurture_status IN (
      'PENDING', 'ACTIVE', 'PAUSED', 'RE_ENGAGED',
      'RECLASSIFIED_HOT', 'OPTED_OUT', 'SUNSET', 'ARCHIVED'
    )),
  current_sequence_type VARCHAR(50) NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL,

  -- Scoring nurture
  engagement_score_initial INTEGER NOT NULL,
  engagement_score_current INTEGER NOT NULL DEFAULT 0,
  last_score_update TIMESTAMP WITH TIME ZONE,

  -- Classification
  segment VARCHAR(30) NOT NULL,
  scoring_categorie VARCHAR(10) NOT NULL,
  parcours_etape VARCHAR(30) NOT NULL DEFAULT 'awareness'
    CHECK (parcours_etape IN ('awareness', 'consideration', 'decision')),

  -- Engagement
  emails_nurture_sent INTEGER NOT NULL DEFAULT 0,
  emails_opened INTEGER NOT NULL DEFAULT 0,
  emails_clicked INTEGER NOT NULL DEFAULT 0,
  content_downloaded INTEGER NOT NULL DEFAULT 0,
  linkedin_interactions INTEGER NOT NULL DEFAULT 0,
  replies_received INTEGER NOT NULL DEFAULT 0,
  site_visits INTEGER NOT NULL DEFAULT 0,
  pricing_page_visits INTEGER NOT NULL DEFAULT 0,

  -- Timing
  next_email_scheduled_at TIMESTAMP WITH TIME ZONE,
  next_rescore_at TIMESTAMP WITH TIME ZONE,
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  last_email_sent_at TIMESTAMP WITH TIME ZONE,
  inactive_since TIMESTAMP WITH TIME ZONE,

  -- RGPD
  consent_status VARCHAR(20) NOT NULL DEFAULT 'LEGITIMATE_INTEREST'
    CHECK (consent_status IN ('LEGITIMATE_INTEREST', 'OPT_IN', 'OPTED_OUT', 'DELETED')),
  opt_out_at TIMESTAMP WITH TIME ZONE,
  data_retention_until TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(prospect_id)
);

CREATE INDEX idx_nurture_status ON nurture_prospects(nurture_status);
CREATE INDEX idx_nurture_next_email ON nurture_prospects(next_email_scheduled_at)
  WHERE nurture_status = 'ACTIVE';
CREATE INDEX idx_nurture_next_rescore ON nurture_prospects(next_rescore_at)
  WHERE nurture_status IN ('ACTIVE', 'PAUSED');
CREATE INDEX idx_nurture_inactive ON nurture_prospects(inactive_since)
  WHERE nurture_status = 'ACTIVE' AND inactive_since IS NOT NULL;
CREATE INDEX idx_nurture_segment ON nurture_prospects(segment);

-- Table des interactions nurture
CREATE TABLE IF NOT EXISTS nurture_interactions (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  interaction_type VARCHAR(50) NOT NULL
    CHECK (interaction_type IN (
      'EMAIL_SENT', 'EMAIL_OPENED', 'EMAIL_CLICKED', 'EMAIL_REPLIED',
      'CONTENT_DOWNLOADED', 'LINKEDIN_LIKE', 'LINKEDIN_COMMENT',
      'SITE_VISIT', 'PRICING_PAGE_VISIT', 'RESCORE', 'RECLASSIFIED',
      'OPT_OUT', 'SUNSET', 'RE_ENGAGEMENT_SENT', 'RE_PERMISSION_SENT'
    )),
  canal VARCHAR(20) NOT NULL,
  details JSONB,
  score_delta INTEGER NOT NULL DEFAULT 0,
  score_after INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nurture_interactions_prospect ON nurture_interactions(prospect_id);
CREATE INDEX idx_nurture_interactions_type ON nurture_interactions(interaction_type);
CREATE INDEX idx_nurture_interactions_date ON nurture_interactions(created_at);

-- Table des emails nurture envoyes
CREATE TABLE IF NOT EXISTS nurture_emails (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  email_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  sequence_type VARCHAR(50) NOT NULL,
  step_number INTEGER NOT NULL,
  parcours_etape VARCHAR(30) NOT NULL,
  subject_line VARCHAR(200) NOT NULL,
  body_preview VARCHAR(500),
  content_piece_id VARCHAR(50),
  gmail_message_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'FAILED')),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nurture_emails_prospect ON nurture_emails(prospect_id);
CREATE INDEX idx_nurture_emails_status ON nurture_emails(status);
```

---

## 3. SOUS-AGENTS

L'Agent 6 est compose de 3 sous-agents specialises qui operent en coordination.

### 3.1 Architecture globale

```
                    AGENT 6 (NURTUREUR)
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
    ============    ============    ============
    | 6a. EMAIL |    | 6b. LINKEDIN |  | 6c. RE-SCOREUR |
    | NURTURE   |    | PASSIF       |  | PERIODIQUE     |
    ============    ============    ============
          |              |              |
          v              v              v
    Sequences       Likes/Comments  Re-scoring
    comportementales  sur posts     mensuel
    par segment      prospects     signaux + engagement
```

---

### 3.2 SOUS-AGENT 6a : EMAIL NURTURE

#### 3.2.1 Mission

Le sous-agent Email Nurture gere l'envoi de sequences email comportementales (NON drip statiques) aux prospects en nurturing. Chaque email est adapte a l'etape du parcours d'achat (awareness, consideration, decision) et au segment du prospect. Le ratio est 3:1 valeur:promo minimum.

#### 3.2.2 Principes

- **Comportemental, pas drip** : Le chemin de chaque prospect depend de ses actions (ouvre, clique, repond) et non d'un calendrier fixe
- **3:1 valeur:promo** : Pour 3 emails de contenu (article, cas d'usage, insight), maximum 1 email mentionnant Axiom
- **Frequence controlee** : Maximum 2 emails/semaine, minimum 1 email/2 semaines
- **Personnalisation IA** : Chaque email est personnalise via Claude API en fonction du segment, du poste, et de l'historique d'engagement
- **Tracking ouverture et clics** : Pixel transparent 1x1 pour opens, liens trackes pour clics

#### 3.2.3 Processus detaille

```
1. Reception du prospect (depuis NurturerInput ou re-engagement)
     |
2. Determination du segment et de l'etape parcours
     |
3. Selection du prochain contenu dans la sequence
     |
4. Personnalisation via Claude API
     |
5. Envoi via Gmail API (domaine nurture dedie)
     |
6. Tracking ouverture/clic
     |
7. Branchement comportemental :
     |-- Si ouvert + clic → accelerer, passer au contenu suivant
     |-- Si ouvert sans clic → re-envoyer variante, meme etape
     |-- Si non ouvert → changer sujet, re-tenter 1 fois
     |-- Si repondu → classifier, potentiellement reclassifier HOT
     |
8. Mise a jour du score d'engagement
     |
9. Planification du prochain envoi
```

#### 3.2.4 Code TypeScript complet

```typescript
import { Queue, Worker, Job } from 'bullmq'
import { Anthropic } from '@anthropic-ai/sdk'
import { google } from 'googleapis'
import { pool } from '../database/connection'

// === CONFIGURATION ===

const NURTURE_EMAIL_CONFIG = {
  max_emails_per_week: 2,
  min_days_between_emails: 3,
  max_days_between_emails: 14,
  value_to_promo_ratio: 3,  // 3 emails valeur pour 1 promo
  tracking_pixel: true,
  tracking_links: true,
  domaine_envoi: 'insights.axiom-marketing.fr',  // Domaine dedie nurture
  from_name: 'Jonathan | Axiom Marketing',
  reply_to: 'jonathan@axiom-marketing.fr',
  unsubscribe_url: 'https://axiom-marketing.fr/unsubscribe',
}

// === TYPES ===

interface NurtureEmailJob {
  prospect_id: string
  sequence_type: string
  step_number: number
  content_piece: ContentPiece
  parcours_etape: 'awareness' | 'consideration' | 'decision'
  attempt: number          // 1 = premier envoi, 2 = re-envoi si non ouvert
  previous_behavior: EmailBehavior | null
}

interface EmailBehavior {
  opened: boolean
  clicked: boolean
  replied: boolean
  open_count: number
  click_links: string[]
  time_to_open_hours: number | null
}

interface ContentPiece {
  content_id: string
  title: string
  format: 'article' | 'case_study' | 'checklist' | 'guide' | 'video' | 'webinar' | 'infographic'
  parcours_etape: 'awareness' | 'consideration' | 'decision'
  segment: string
  type: 'valeur' | 'promo'
  subject_line_template: string
  body_template: string
  cta_text: string
  cta_url: string
  tags: string[]
}

// === QUEUE ===

const nurturerEmailQueue = new Queue('nurturer-email', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  }
})

// === WORKER PRINCIPAL ===

const emailNurtureWorker = new Worker('nurturer-email', async (job: Job<NurtureEmailJob>) => {
  const { prospect_id, sequence_type, step_number, content_piece, parcours_etape, attempt, previous_behavior } = job.data

  console.log(`[6a] Email nurture: prospect=${prospect_id}, step=${step_number}, attempt=${attempt}`)

  // 1. Charger le prospect
  const prospect = await loadNurtureProspect(prospect_id)
  if (!prospect) throw new Error(`Prospect ${prospect_id} non trouve en nurture`)

  // 2. Verifier que le prospect est toujours actif
  if (prospect.nurture_status !== 'ACTIVE' && prospect.nurture_status !== 'RE_ENGAGED') {
    console.log(`[6a] Prospect ${prospect_id} n'est plus actif (${prospect.nurture_status}), skip`)
    return { skipped: true, reason: prospect.nurture_status }
  }

  // 3. Verifier opt-out
  if (prospect.consent_status === 'OPTED_OUT') {
    console.log(`[6a] Prospect ${prospect_id} a fait opt-out, skip`)
    return { skipped: true, reason: 'opted_out' }
  }

  // 4. Verifier le delai minimum entre emails
  if (prospect.last_email_sent_at) {
    const daysSinceLastEmail = daysBetween(new Date(prospect.last_email_sent_at), new Date())
    if (daysSinceLastEmail < NURTURE_EMAIL_CONFIG.min_days_between_emails) {
      // Re-planifier plus tard
      const delay = (NURTURE_EMAIL_CONFIG.min_days_between_emails - daysSinceLastEmail) * 86400000
      await nurturerEmailQueue.add(
        `nurture-email-${prospect_id}-step${step_number}`,
        job.data,
        { delay }
      )
      return { rescheduled: true, delay_days: NURTURE_EMAIL_CONFIG.min_days_between_emails - daysSinceLastEmail }
    }
  }

  // 5. Appliquer la logique comportementale
  let emailContent = content_piece
  let subject_line = content_piece.subject_line_template

  if (attempt === 2 && previous_behavior) {
    if (!previous_behavior.opened) {
      // Non ouvert -> changer le sujet
      subject_line = await generateAlternativeSubject(content_piece, prospect)
    } else if (previous_behavior.opened && !previous_behavior.clicked) {
      // Ouvert mais pas clique -> re-envoyer variante avec CTA different
      emailContent = await generateContentVariant(content_piece, prospect)
    }
  }

  // 6. Personnaliser via Claude API
  const personalizedEmail = await personalizeNurtureEmail(emailContent, prospect, parcours_etape, subject_line)

  // 7. Envoyer via Gmail API
  const sendResult = await sendNurtureEmail(prospect, personalizedEmail)

  // 8. Logger l'interaction
  const newScore = prospect.engagement_score_current // Score unchanged at send
  await logNurtureInteraction({
    prospect_id,
    interaction_type: 'EMAIL_SENT',
    canal: 'email',
    details: {
      email_id: sendResult.email_id,
      step_number,
      content_id: content_piece.content_id,
      subject_line: personalizedEmail.subject,
      parcours_etape,
      attempt,
      sequence_type
    },
    score_delta: 0,
    score_after: newScore
  })

  // 9. Mettre a jour le prospect
  await pool.query(`
    UPDATE nurture_prospects SET
      current_step = $1,
      emails_nurture_sent = emails_nurture_sent + 1,
      last_email_sent_at = NOW(),
      next_email_scheduled_at = NOW() + INTERVAL '${calculateNextEmailDelay(prospect, content_piece)} days',
      updated_at = NOW()
    WHERE prospect_id = $2
  `, [step_number, prospect_id])

  // 10. Enregistrer l'email pour tracking
  await pool.query(`
    INSERT INTO nurture_emails (prospect_id, sequence_type, step_number, parcours_etape,
      subject_line, body_preview, content_piece_id, gmail_message_id, status, sent_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SENT', NOW())
  `, [
    prospect_id, sequence_type, step_number, parcours_etape,
    personalizedEmail.subject,
    personalizedEmail.body.substring(0, 500),
    content_piece.content_id,
    sendResult.gmail_message_id
  ])

  // 11. Planifier le prochain email
  await scheduleNextNurtureEmail(prospect_id, sequence_type, step_number, parcours_etape, content_piece)

  return {
    success: true,
    email_id: sendResult.email_id,
    gmail_message_id: sendResult.gmail_message_id,
    step: step_number,
    subject: personalizedEmail.subject
  }
}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 3,
  limiter: { max: 10, duration: 60000 },  // Max 10 emails/minute
})

// === PERSONNALISATION VIA CLAUDE API ===

const anthropic = new Anthropic()

async function personalizeNurtureEmail(
  content: ContentPiece,
  prospect: NurtureProspectRecord,
  parcours_etape: string,
  subject_line: string
): Promise<{ subject: string; body: string }> {

  const systemPrompt = `Tu es un expert en marketing digital et developpement web.
Tu rediges des emails de nurturing pour Axiom Marketing, un studio dev web IA-augmente.

REGLES ABSOLUES:
- Ton professionnel mais accessible, jamais commercial agressif
- Tutoiement
- Pas de "j'espere que tu vas bien" ou formules creuses
- Maximum 150 mots pour le corps de l'email
- Le contenu doit apporter de la VALEUR (insight, conseil, donnee)
- Si c'est un email "valeur" (pas promo), NE PAS mentionner Axiom dans le corps
- Si c'est un email "promo", mentionner Axiom naturellement, pas en mode pub
- CTA clair et unique
- Pas d'emoji dans le sujet
- 1 emoji max dans le corps (optionnel)
- Signature: Jonathan — Axiom Marketing`

  const userPrompt = `Personnalise cet email de nurturing:

PROSPECT:
- Prenom: ${prospect.prenom}
- Entreprise: ${prospect.entreprise_nom}
- Poste: ${prospect.poste}
- Segment: ${prospect.segment}
- Etape parcours: ${parcours_etape}
- Score engagement: ${prospect.engagement_score_current}/100
- Emails nurture recus: ${prospect.emails_nurture_sent}

CONTENU A PERSONNALISER:
- Type: ${content.type} (${content.type === 'valeur' ? 'NE PAS mentionner Axiom' : 'Peut mentionner Axiom'})
- Format: ${content.format}
- Titre du contenu: ${content.title}
- Sujet email (a personnaliser): ${subject_line}
- Corps template: ${content.body_template}
- CTA: ${content.cta_text}
- URL CTA: ${content.cta_url}

Retourne un JSON avec:
{
  "subject": "sujet personnalise",
  "body": "corps personnalise avec CTA inclus"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    return JSON.parse(jsonMatch[0])
  } catch {
    // Fallback: utiliser le template tel quel
    return {
      subject: subject_line.replace('{{prenom}}', prospect.prenom)
        .replace('{{entreprise}}', prospect.entreprise_nom),
      body: content.body_template.replace('{{prenom}}', prospect.prenom)
        .replace('{{entreprise}}', prospect.entreprise_nom)
    }
  }
}

// === GENERATION SUJET ALTERNATIF ===

async function generateAlternativeSubject(
  content: ContentPiece,
  prospect: NurtureProspectRecord
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `L'email avec le sujet "${content.subject_line_template}" n'a pas ete ouvert par ${prospect.prenom} (${prospect.poste} chez ${prospect.entreprise_nom}, segment ${prospect.segment}).

Genere UN sujet alternatif plus accrocheur. Maximum 60 caracteres. Pas d'emoji. Pas de majuscules excessives. Pas de "Re:" ou faux reply.

Retourne UNIQUEMENT le sujet, rien d'autre.`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text.trim().replace(/^["']|["']$/g, '')
}

// === GENERATION VARIANTE CONTENU ===

async function generateContentVariant(
  content: ContentPiece,
  prospect: NurtureProspectRecord
): Promise<ContentPiece> {
  // Garder le meme contenu mais modifier l'angle
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Le prospect ${prospect.prenom} (${prospect.poste}, ${prospect.entreprise_nom}) a OUVERT l'email "${content.subject_line_template}" mais N'A PAS CLIQUE sur le CTA "${content.cta_text}".

Le corps etait: "${content.body_template}"

Reecris le corps avec un angle different et un CTA plus engageant. Garde le meme format et la meme longueur. Maximum 150 mots.

Retourne un JSON: {"body_template": "...", "cta_text": "..."}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return content
    const variant = JSON.parse(jsonMatch[0])
    return {
      ...content,
      body_template: variant.body_template || content.body_template,
      cta_text: variant.cta_text || content.cta_text
    }
  } catch {
    return content
  }
}

// === ENVOI VIA GMAIL API ===

async function sendNurtureEmail(
  prospect: NurtureProspectRecord,
  email: { subject: string; body: string }
): Promise<{ email_id: string; gmail_message_id: string }> {

  const email_id = crypto.randomUUID()

  // Ajouter le pixel de tracking
  const trackingPixel = NURTURE_EMAIL_CONFIG.tracking_pixel
    ? `<img src="https://track.axiom-marketing.fr/open/${email_id}" width="1" height="1" style="display:none" />`
    : ''

  // Ajouter le lien de desinscription
  const unsubscribeLink = `\n\n---\nSi tu ne souhaites plus recevoir ces emails: ${NURTURE_EMAIL_CONFIG.unsubscribe_url}?id=${prospect.prospect_id}`

  // Wrapper les liens pour tracking
  const bodyWithTracking = NURTURE_EMAIL_CONFIG.tracking_links
    ? wrapLinksForTracking(email.body + unsubscribeLink, email_id)
    : email.body + unsubscribeLink

  // Construire le message MIME
  const rawMessage = buildMimeMessage({
    from: `${NURTURE_EMAIL_CONFIG.from_name} <nurture@${NURTURE_EMAIL_CONFIG.domaine_envoi}>`,
    to: prospect.email,
    replyTo: NURTURE_EMAIL_CONFIG.reply_to,
    subject: email.subject,
    textBody: bodyWithTracking,
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px;">${textToHtml(bodyWithTracking)}${trackingPixel}</div>`,
    headers: {
      'List-Unsubscribe': `<${NURTURE_EMAIL_CONFIG.unsubscribe_url}?id=${prospect.prospect_id}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Axiom-Email-Id': email_id,
      'X-Axiom-Prospect-Id': prospect.prospect_id,
      'X-Axiom-Type': 'nurture'
    }
  })

  // Envoyer via Gmail API
  const gmail = google.gmail({ version: 'v1', auth: await getGmailAuth() })
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: Buffer.from(rawMessage).toString('base64url')
    }
  })

  return {
    email_id,
    gmail_message_id: response.data.id || ''
  }
}

// === WEBHOOK TRACKING ===

// Endpoint pour pixel de tracking (ouverture)
async function handleOpenTracking(email_id: string): Promise<void> {
  const result = await pool.query(`
    UPDATE nurture_emails SET
      status = CASE WHEN status = 'SENT' THEN 'OPENED' ELSE status END,
      opened_at = COALESCE(opened_at, NOW())
    WHERE email_id = $1
    RETURNING prospect_id, step_number
  `, [email_id])

  if (result.rows.length > 0) {
    const { prospect_id, step_number } = result.rows[0]
    // Mettre a jour le score d'engagement
    await updateEngagementScore(prospect_id, 'EMAIL_OPENED', 2)
    // Mettre a jour le compteur
    await pool.query(`
      UPDATE nurture_prospects SET
        emails_opened = emails_opened + 1,
        last_interaction_at = NOW(),
        inactive_since = NULL,
        updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect_id])
  }
}

// Endpoint pour tracking de clics
async function handleClickTracking(email_id: string, link_url: string): Promise<void> {
  const result = await pool.query(`
    UPDATE nurture_emails SET
      status = 'CLICKED',
      clicked_at = COALESCE(clicked_at, NOW())
    WHERE email_id = $1
    RETURNING prospect_id
  `, [email_id])

  if (result.rows.length > 0) {
    const { prospect_id } = result.rows[0]
    await updateEngagementScore(prospect_id, 'EMAIL_CLICKED', 5)
    await pool.query(`
      UPDATE nurture_prospects SET
        emails_clicked = emails_clicked + 1,
        last_interaction_at = NOW(),
        inactive_since = NULL,
        updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect_id])

    // Verifier si c'est la page pricing
    if (link_url.includes('/pricing') || link_url.includes('/tarifs')) {
      await updateEngagementScore(prospect_id, 'PRICING_PAGE_VISIT', 10)
      await pool.query(`
        UPDATE nurture_prospects SET
          pricing_page_visits = pricing_page_visits + 1,
          updated_at = NOW()
        WHERE prospect_id = $1
      `, [prospect_id])
      // Trigger re-scoring immediat
      await triggerImmediateRescore(prospect_id, 'pricing_page_visit')
    }
  }
}

// === LOGIQUE COMPORTEMENTALE ===

async function scheduleNextNurtureEmail(
  prospect_id: string,
  sequence_type: string,
  current_step: number,
  current_parcours: string,
  last_content: ContentPiece
): Promise<void> {

  // Charger l'etat du prospect
  const prospect = await loadNurtureProspect(prospect_id)
  if (!prospect) return

  // Verifier le comportement du dernier email (apres un delai pour laisser le tracking se faire)
  // Ce job sera planifie avec un delai de 72h pour laisser le temps de l'ouverture
  const checkBehaviorDelay = 72 * 3600 * 1000 // 72 heures

  await nurturerEmailQueue.add(
    `check-behavior-${prospect_id}-step${current_step}`,
    {
      type: 'CHECK_BEHAVIOR',
      prospect_id,
      sequence_type,
      step_number: current_step,
      content_piece_id: last_content.content_id
    },
    { delay: checkBehaviorDelay }
  )
}

// Worker pour verifier le comportement et decider du prochain email
async function handleBehaviorCheck(job: Job): Promise<void> {
  const { prospect_id, sequence_type, step_number, content_piece_id } = job.data

  // Charger l'etat du dernier email
  const emailResult = await pool.query(`
    SELECT status, opened_at, clicked_at, replied_at
    FROM nurture_emails
    WHERE prospect_id = $1 AND content_piece_id = $2
    ORDER BY sent_at DESC LIMIT 1
  `, [prospect_id, content_piece_id])

  if (emailResult.rows.length === 0) return

  const lastEmail = emailResult.rows[0]
  const prospect = await loadNurtureProspect(prospect_id)
  if (!prospect || prospect.nurture_status !== 'ACTIVE') return

  // Determiner le comportement
  const behavior: EmailBehavior = {
    opened: lastEmail.status === 'OPENED' || lastEmail.status === 'CLICKED' || lastEmail.status === 'REPLIED',
    clicked: lastEmail.status === 'CLICKED' || lastEmail.status === 'REPLIED',
    replied: lastEmail.status === 'REPLIED',
    open_count: lastEmail.opened_at ? 1 : 0,
    click_links: [],
    time_to_open_hours: lastEmail.opened_at
      ? (new Date(lastEmail.opened_at).getTime() - new Date(lastEmail.sent_at).getTime()) / 3600000
      : null
  }

  // Si repondu, classifier et potentiellement reclassifier
  if (behavior.replied) {
    // La reponse est traitee par le monitoring des reponses
    return
  }

  // Determiner le prochain contenu
  const nextContent = await selectNextContent(prospect, behavior, step_number, sequence_type)

  if (!nextContent) {
    // Plus de contenu disponible pour cette sequence
    console.log(`[6a] Fin de sequence nurture pour ${prospect_id}`)
    // Passer en re-engagement si inactif, sinon continuer en cycle
    if (!behavior.opened && prospect.emails_opened === 0) {
      // Aucune ouverture sur toute la sequence -> re-engagement
      await pool.query(`
        UPDATE nurture_prospects SET
          inactive_since = COALESCE(inactive_since, NOW()),
          updated_at = NOW()
        WHERE prospect_id = $1
      `, [prospect_id])
    }
    return
  }

  // Determiner le delai
  let delay_days: number

  if (behavior.clicked) {
    delay_days = 3  // Engage -> accelerer
  } else if (behavior.opened) {
    delay_days = 5  // Ouvert -> rythme normal
  } else {
    delay_days = 10 // Non ouvert -> ralentir
  }

  // Planifier le prochain email
  const delay = delay_days * 86400000

  await nurturerEmailQueue.add(
    `nurture-email-${prospect_id}-step${step_number + 1}`,
    {
      prospect_id,
      sequence_type,
      step_number: step_number + 1,
      content_piece: nextContent,
      parcours_etape: nextContent.parcours_etape,
      attempt: 1,
      previous_behavior: behavior
    },
    { delay }
  )

  // Si non ouvert et c'est la premiere tentative, planifier un re-envoi
  if (!behavior.opened && step_number <= 2) {
    const lastContent = await getContentPiece(content_piece_id)
    if (lastContent) {
      await nurturerEmailQueue.add(
        `nurture-email-${prospect_id}-step${step_number}-retry`,
        {
          prospect_id,
          sequence_type,
          step_number,
          content_piece: lastContent,
          parcours_etape: lastContent.parcours_etape,
          attempt: 2,
          previous_behavior: behavior
        },
        { delay: 5 * 86400000 } // Re-envoyer dans 5 jours avec sujet different
      )
    }
  }
}

// === SELECTION INTELLIGENTE DU CONTENU ===

async function selectNextContent(
  prospect: NurtureProspectRecord,
  behavior: EmailBehavior,
  current_step: number,
  sequence_type: string
): Promise<ContentPiece | null> {

  // Charger les contenus deja envoyes a ce prospect
  const sentContents = await pool.query(`
    SELECT content_piece_id FROM nurture_emails
    WHERE prospect_id = $1 AND status != 'FAILED'
  `, [prospect.prospect_id])
  const sentIds = new Set(sentContents.rows.map(r => r.content_piece_id))

  // Determiner l'etape du parcours
  let targetEtape = prospect.parcours_etape

  // Si le prospect engage bien, avancer dans le parcours
  if (behavior.clicked && targetEtape === 'awareness') {
    targetEtape = 'consideration'
    await pool.query(`
      UPDATE nurture_prospects SET parcours_etape = 'consideration', updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect.prospect_id])
  } else if (behavior.clicked && targetEtape === 'consideration') {
    targetEtape = 'decision'
    await pool.query(`
      UPDATE nurture_prospects SET parcours_etape = 'decision', updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect.prospect_id])
  }

  // Determiner si c'est un email valeur ou promo
  const emailType = determineEmailType(prospect.emails_nurture_sent)

  // Chercher le prochain contenu non envoye pour ce segment et cette etape
  const contentPool = getContentPool(prospect.segment, targetEtape, emailType)
  const availableContent = contentPool.filter(c => !sentIds.has(c.content_id))

  if (availableContent.length === 0) {
    // Tenter l'etape suivante
    if (targetEtape === 'awareness') {
      return selectNextContent(
        { ...prospect, parcours_etape: 'consideration' } as NurtureProspectRecord,
        behavior, current_step, sequence_type
      )
    }
    return null // Plus de contenu
  }

  // Selectionner le contenu le plus pertinent
  return availableContent[0]
}

// Ratio 3:1 valeur:promo
function determineEmailType(totalSent: number): 'valeur' | 'promo' {
  // Emails 1, 2, 3 = valeur, email 4 = promo, etc.
  return (totalSent + 1) % 4 === 0 ? 'promo' : 'valeur'
}

// === GESTION DES ERREURS ===

emailNurtureWorker.on('failed', async (job, err) => {
  console.error(`[6a] Email nurture failed: job=${job?.id}, error=${err.message}`)

  if (job && job.attemptsMade >= 3) {
    // Apres 3 tentatives, logger et passer
    const { prospect_id, step_number } = job.data
    await logNurtureInteraction({
      prospect_id,
      interaction_type: 'EMAIL_SENT',
      canal: 'email',
      details: {
        step_number,
        error: err.message,
        status: 'FAILED_PERMANENTLY'
      },
      score_delta: 0,
      score_after: 0
    })
  }
})

emailNurtureWorker.on('error', (err) => {
  console.error(`[6a] Worker error:`, err)
})

// === METRIQUES SOUS-AGENT 6a ===

interface EmailNurtureMetrics {
  periode: string
  emails_nurture_envoyes: number
  taux_ouverture: number           // %
  taux_clic: number                // %
  taux_reponse: number             // %
  ratio_valeur_promo: number       // ex: 3.0
  par_segment: Record<string, {
    envoyes: number
    ouverts: number
    cliques: number
  }>
  par_parcours_etape: Record<string, {
    envoyes: number
    ouverts: number
    cliques: number
  }>
  contenu_top_performing: Array<{
    content_id: string
    title: string
    taux_ouverture: number
    taux_clic: number
  }>
}
```

---

### 3.3 SOUS-AGENT 6b : ENGAGEMENT LINKEDIN PASSIF

#### 3.3.1 Mission

Le sous-agent LinkedIn Passif maintient une presence discrete dans le flux du prospect en likant et commentant ses publications LinkedIn. L'objectif est de garder Axiom dans le radar du prospect sans etre intrusif, et de creer un sentiment de familiarite pour quand le prospect sera pret a avancer.

#### 3.3.2 Principes

- **Passif = pas de messages directs** : Uniquement likes et comments publics, jamais de DM non sollicites
- **Naturel** : Les interactions doivent sembler authentiques, pas automatisees
- **Anti-spam** : Maximum 3 interactions/semaine par prospect, jamais 2 le meme jour
- **Combine avec email** : Si un prospect reagit a un like/comment ET ouvre un email, score boosté
- **Via Waalaxy** : Utilise l'abonnement Waalaxy existant pour l'automatisation

#### 3.3.3 Processus detaille

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

#### 3.3.4 Code TypeScript complet

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

// === METRIQUES SOUS-AGENT 6b ===

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

### 3.4 SOUS-AGENT 6c : RE-SCOREUR PERIODIQUE

#### 3.4.1 Mission

Le sous-agent Re-Scoreur re-evalue periodiquement les prospects en nurturing en re-interrogeant les sources de signaux business (les memes que l'Agent 1 VEILLEUR) et en integrant le score d'engagement accumule. Il reclassifie les prospects (COLD->WARM->HOT) et declenche un re-routing quand un prospect atteint le seuil HOT.

#### 3.4.2 Principes

- **Deux types de triggers** : Periodiques (mensuel pour tous) et immediats (visite site, reponse email, clic pricing)
- **Sources de signaux** : Memes sources que l'Agent 1 (recrutement, levees, technos, contrats publics) + signaux d'engagement nurture
- **Reclassification** : Le score combine signaux business (poids 60%) + engagement nurture (poids 40%)
- **Handoff vers Agent 3** : Quand un prospect passe HOT, il est renvoye au SCOREUR pour re-routing dans le pipeline actif

#### 3.4.3 Processus detaille

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

#### 3.4.4 Code TypeScript complet

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

// === METRIQUES SOUS-AGENT 6c ===

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

## 4. SEQUENCES NURTURE COMPLETES PAR SEGMENT

Chaque segment a sa propre sequence de nurturing adaptee a ses problematiques, son vocabulaire, et son cycle d'achat. Les sequences sont comportementales : le chemin exact depend des actions du prospect.

### 4.1 Sequence PME METRO (PME metropolitaines)

**Duree totale :** 12 semaines (extensible selon engagement)
**Contexte :** PME cherchant un site vitrine ou une presence digitale. Cycle de decision 2-4 mois. Budget typique : 1 500-5 000 EUR.

#### Semaine 1-2 : Awareness

| Jour | Email # | Type | Contenu | CTA | Scoring |
|---|---|---|---|---|---|
| J+7 apres handoff | E1 | Valeur | Article "5 erreurs frequentes sur les sites de PME en 2026" | Lire l'article | open +2, clic +5 |
| J+11 | E2 | Valeur | Infographic "Checklist : votre site perd-il des clients ?" | Telecharger la checklist | open +2, clic +5, download +8 |

**Branchement J+14 :**
- SI E1 ouvert ET E2 clique → Passer a Consideration (accelere)
- SI E1 ouvert, E2 non ouvert → Re-envoyer E2 avec sujet different
- SI ni E1 ni E2 ouverts → Ralentir a 1 email/2 semaines

#### Semaine 3-4 : Awareness (suite) ou Consideration

| Jour | Email # | Type | Contenu (Awareness) | Contenu (Consideration) |
|---|---|---|---|---|
| J+17 | E3 | Valeur | Guide "Pourquoi 80% des PME perdent des clients avec un site lent" | Etude de cas PME locale (avant/apres refonte) |
| J+24 | E4 | Promo (douce) | "Comment Axiom aide les PME a avoir un site qui convertit (sans se ruiner)" | Comparatif : refaire vs. optimiser son site |

**Branchement J+28 :**
- SI engagement score > 20 → Passer a Consideration
- SI E4 clique (page Axiom) → +10 score, trigger re-score immediat
- SI 0 ouverture sur E3+E4 → Marquer inactif, baisser frequence

#### Semaine 5-8 : Consideration

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+31 | E5 | Valeur | Video "3 PME qui ont double leur CA en modernisant leur site" |
| J+38 | E6 | Valeur | Article "Mobile-first : pourquoi c'est non-negociable en 2026" |
| J+45 | E7 | Valeur | Checklist "Les 10 elements indispensables d'un site PME performant" |
| J+52 | E8 | Promo | Cas d'etude Axiom detaille + CTA audit gratuit |

**Branchement J+55 :**
- SI E8 clique (audit gratuit) → RECLASSIFIER HOT, renvoyer au Scoreur
- SI engagement score > 40 → Passer a Decision
- SI engagement score < 10 → Passer en re-engagement

#### Semaine 9-12 : Decision

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+59 | E9 | Valeur | Temoignage client PME (video ou texte) |
| J+66 | E10 | Promo | "Offre decouverte : site vitrine des 1 500 EUR" + FAQ |
| J+73 | E11 | Valeur | Article "Comment bien choisir son prestataire web" |
| J+80 | E12 | Promo (finale) | "Dernier rappel : audit gratuit + devis en 48h" |

**Sortie :**
- SI E10 ou E12 clique → RECLASSIFIER HOT
- SI aucun engagement → Sunset (voir section 7)

---

### 4.2 Sequence ECOMMERCE SHOPIFY

**Duree totale :** 10 semaines
**Contexte :** E-commercants Shopify cherchant a optimiser ou migrer. Cycle de decision 1-3 mois. Budget typique : 5 000-15 000 EUR.

#### Semaine 1-2 : Awareness

| Jour | Email # | Type | Contenu | CTA |
|---|---|---|---|---|
| J+5 | E1 | Valeur | Article "Les 7 erreurs Shopify qui plombent votre taux de conversion" | Lire l'article |
| J+10 | E2 | Valeur | Infographic "Benchmark : taux de conversion Shopify par secteur en 2026" | Telecharger le benchmark |

#### Semaine 3-4 : Awareness/Consideration

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+15 | E3 | Valeur | Guide "Shopify : theme custom vs. theme payant — le vrai calcul" |
| J+21 | E4 | Promo | Etude de cas e-commerce Axiom : +45% de CA apres refonte Shopify |

**Branchement J+23 :**
- SI E4 clique → Accelerer vers Decision
- SI E2 download → Passer a Consideration
- SI 0 engagement → Ralentir

#### Semaine 5-7 : Consideration

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+28 | E5 | Valeur | Article "Server-side tracking Shopify : pourquoi c'est indispensable (et comment)" |
| J+35 | E6 | Valeur | Comparatif "Shopify Plus vs. Shopify Standard : quand migrer ?" |
| J+42 | E7 | Promo | "Comment Axiom booste les boutiques Shopify (tracking + custom dev)" |

#### Semaine 8-10 : Decision

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+49 | E8 | Valeur | Temoignage client e-commerce Axiom (chiffres concrets) |
| J+56 | E9 | Promo | "Audit Shopify gratuit : on analyse votre boutique en 30 min" |
| J+63 | E10 | Promo (finale) | "Tracking server-side : 990 EUR setup + 89 EUR/mois. Prêt a booster votre ROAS ?" |

---

### 4.3 Sequence COLLECTIVITES

**Duree totale :** 16 semaines (cycle plus long pour le public)
**Contexte :** Collectivites devant se mettre en conformite RGAA. Cycle de decision 4-12 mois (marches publics). Budget typique : 8 000-25 000 EUR.

#### Semaine 1-4 : Awareness

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+10 | E1 | Valeur | Article "RGAA 4.1 : ou en sont les collectivites en 2026 ?" |
| J+18 | E2 | Valeur | Infographic "Les 10 non-conformites RGAA les plus frequentes" |
| J+26 | E3 | Valeur | Guide "Accessibilite web : obligations legales et echeances pour les collectivites" |
| J+34 | E4 | Promo | "Auto-diagnostic RGAA gratuit : evaluez votre site en 5 minutes" |

#### Semaine 5-10 : Consideration

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+42 | E5 | Valeur | Etude de cas collectivite conforme RGAA (avant/apres, timeline) |
| J+50 | E6 | Valeur | Article "Comment rediger un cahier des charges RGAA" |
| J+58 | E7 | Valeur | Webinar replay "RGAA : retour d'experience d'une commune de 30 000 hab." |
| J+66 | E8 | Promo | "Axiom : expert RGAA pour collectivites, des 8 000 EUR" |

#### Semaine 11-16 : Decision

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+74 | E9 | Valeur | Checklist "Preparer sa consultation RGAA : les 15 points cles" |
| J+82 | E10 | Valeur | Article "RGAA et marches publics : criteres de selection du prestataire" |
| J+90 | E11 | Promo | Temoignage collectivite + resultats d'audit |
| J+100 | E12 | Valeur | "Les subventions pour la mise en conformite RGAA en 2026" |
| J+108 | E13 | Promo (finale) | "Audit RGAA gratuit + accompagnement complet. Parlons-en ?" |

---

### 4.4 Sequence STARTUPS

**Duree totale :** 8 semaines (cycle rapide)
**Contexte :** Startups cherchant des MVP, apps mobiles, ou apps metier. Cycle rapide. Budget typique : 15 000-40 000 EUR.

#### Semaine 1-2 : Awareness

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+5 | E1 | Valeur | Article "MVP en 2026 : Flutter vs. React Native vs. natif — le bon choix" |
| J+10 | E2 | Valeur | Infographic "Timeline realiste d'un MVP : de l'idee au store" |

#### Semaine 3-4 : Consideration

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+15 | E3 | Valeur | Etude de cas startup : "De 0 a 10K utilisateurs en 4 mois avec Flutter" |
| J+21 | E4 | Promo | "Axiom Studio : votre MVP en 8 semaines, des 15 000 EUR" |

#### Semaine 5-6 : Decision

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+28 | E5 | Valeur | Article "Les 5 erreurs fatales des startups qui outsourcent leur dev" |
| J+35 | E6 | Valeur | Guide "Comment estimer le budget de votre app sans se planter" |

#### Semaine 7-8 : Decision (finale)

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+42 | E7 | Promo | Temoignage startup Axiom + chiffres (dl, retention, CA genere) |
| J+49 | E8 | Promo (finale) | "Prenez 30 min pour qu'on regarde votre projet ensemble — sans engagement" |

---

### 4.5 Sequence AGENCES WL (White Label)

**Duree totale :** 10 semaines
**Contexte :** Agences de communication cherchant un partenaire dev. Cycle de decision 1-3 mois. Budget variable (projets clients).

#### Semaine 1-2 : Awareness

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+7 | E1 | Valeur | Article "Pourquoi les agences qui sous-traitent le dev gagnent plus" |
| J+12 | E2 | Valeur | Infographic "Modele White Label : comment ca marche concretement" |

#### Semaine 3-4 : Consideration

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+18 | E3 | Valeur | Etude de cas : "Cette agence parisienne a triple ses projets web grace au WL" |
| J+24 | E4 | Promo | "Axiom White Label : dev web sous votre marque, marge geree par vous" |

#### Semaine 5-7 : Consideration approfondie

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+31 | E5 | Valeur | Guide "Comment presenter un devis web a votre client (quand c'est un partenaire qui dev)" |
| J+38 | E6 | Valeur | Article "IA dans le dev web : comment l'expliquer a vos clients sans les effrayer" |
| J+45 | E7 | Promo | Catalogue des prestations Axiom WL + grille tarifaire partenaire |

#### Semaine 8-10 : Decision

| Jour | Email # | Type | Contenu |
|---|---|---|---|
| J+52 | E8 | Valeur | Temoignage agence WL partenaire Axiom |
| J+59 | E9 | Promo | "Offre decouverte : votre premier projet WL avec accompagnement premium" |
| J+66 | E10 | Promo (finale) | "Testons sur un projet : zero risque, votre marge garantie" |

---

### 4.6 Logique comportementale commune a toutes les sequences

```typescript
interface SequenceBranching {
  conditions: BranchCondition[]
  default_action: 'continue' | 'slow_down' | 'speed_up' | 're_engage' | 'sunset'
}

interface BranchCondition {
  trigger: string
  check: (prospect: NurtureProspectRecord, emailResult: EmailBehavior) => boolean
  action: string
  score_adjustment: number
}

const SEQUENCE_BRANCHING_RULES: BranchCondition[] = [
  // Triggers de promotion
  {
    trigger: 'EMAIL_CLICKED_PRICING',
    check: (p, e) => e.clicked && e.click_links.some(l => l.includes('/pricing') || l.includes('/tarifs')),
    action: 'RECLASSIFY_HOT',
    score_adjustment: +15
  },
  {
    trigger: 'EMAIL_REPLIED_POSITIVE',
    check: (p, e) => e.replied,
    action: 'RECLASSIFY_HOT',
    score_adjustment: +20
  },
  {
    trigger: 'ENGAGEMENT_SCORE_HIGH',
    check: (p) => p.engagement_score_current >= 75,
    action: 'RECLASSIFY_HOT',
    score_adjustment: 0
  },
  {
    trigger: 'MULTIPLE_CLICKS',
    check: (p) => p.emails_clicked >= 3,
    action: 'ADVANCE_PARCOURS',
    score_adjustment: +5
  },

  // Triggers de ralentissement
  {
    trigger: 'NO_OPENS_3_CONSECUTIVE',
    check: (p) => p.emails_nurture_sent >= 3 && p.emails_opened === 0,
    action: 'SLOW_DOWN',
    score_adjustment: -5
  },
  {
    trigger: 'LOW_ENGAGEMENT',
    check: (p) => p.engagement_score_current < 10 && p.emails_nurture_sent >= 5,
    action: 'RE_ENGAGE',
    score_adjustment: 0
  },

  // Triggers de sunset
  {
    trigger: 'INACTIVE_180_DAYS',
    check: (p) => p.inactive_since !== null &&
      daysBetween(new Date(p.inactive_since), new Date()) >= 180,
    action: 'SUNSET',
    score_adjustment: 0
  }
]

async function applyBranchingRules(
  prospect: NurtureProspectRecord,
  emailBehavior: EmailBehavior
): Promise<string> {
  for (const rule of SEQUENCE_BRANCHING_RULES) {
    if (rule.check(prospect, emailBehavior)) {
      console.log(`[6] Branching rule triggered: ${rule.trigger} for ${prospect.prospect_id}`)

      // Appliquer l'ajustement de score
      if (rule.score_adjustment !== 0) {
        await updateEngagementScore(prospect.prospect_id, rule.trigger, rule.score_adjustment)
      }

      return rule.action
    }
  }

  return 'CONTINUE'
}
```

---

## 5. CONTENU PAR SEGMENT

Mapping precis des contenus Axiom aux 5 segments. Pour chaque segment : pieces de contenu avec titre, format, etape du parcours, CTA, et identifiant unique.

### 5.1 PME METRO

| ID | Titre | Format | Etape | Type | CTA |
|---|---|---|---|---|---|
| PME-AW-01 | "5 erreurs frequentes sur les sites de PME en 2026" | Article blog | Awareness | Valeur | Lire l'article |
| PME-AW-02 | "Checklist : votre site perd-il des clients ?" | Infographic PDF | Awareness | Valeur | Telecharger |
| PME-AW-03 | "Pourquoi 80% des PME perdent des clients avec un site lent" | Guide PDF | Awareness | Valeur | Telecharger |
| PME-CO-01 | "3 PME qui ont double leur CA en modernisant leur site" | Video (3 min) | Consideration | Valeur | Voir la video |
| PME-CO-02 | "Mobile-first : pourquoi c'est non-negociable en 2026" | Article blog | Consideration | Valeur | Lire l'article |
| PME-CO-03 | "Les 10 elements indispensables d'un site PME performant" | Checklist PDF | Consideration | Valeur | Telecharger |
| PME-CO-04 | "Comment Axiom aide les PME a avoir un site qui convertit" | Cas d'etude | Consideration | Promo | Voir le cas d'etude |
| PME-DE-01 | "Temoignage PME : comment [Client] a gagne 40% de leads" | Video temoignage | Decision | Valeur | Voir le temoignage |
| PME-DE-02 | "Site vitrine professionnel des 1 500 EUR — ce qui est inclus" | Landing page | Decision | Promo | Demander un devis |
| PME-DE-03 | "Comment bien choisir son prestataire web (les questions a poser)" | Article blog | Decision | Valeur | Lire l'article |

### 5.2 ECOMMERCE SHOPIFY

| ID | Titre | Format | Etape | Type | CTA |
|---|---|---|---|---|---|
| SHOP-AW-01 | "Les 7 erreurs Shopify qui plombent votre conversion" | Article blog | Awareness | Valeur | Lire l'article |
| SHOP-AW-02 | "Benchmark conversion Shopify par secteur 2026" | Infographic PDF | Awareness | Valeur | Telecharger |
| SHOP-CO-01 | "Theme custom vs. theme payant : le vrai calcul" | Guide PDF | Consideration | Valeur | Telecharger |
| SHOP-CO-02 | "Server-side tracking Shopify : le guide complet" | Article technique | Consideration | Valeur | Lire l'article |
| SHOP-CO-03 | "Shopify Plus vs. Standard : matrice de decision" | Comparatif PDF | Consideration | Valeur | Telecharger |
| SHOP-CO-04 | "Comment Axiom booste les boutiques Shopify" | Cas d'etude | Consideration | Promo | Voir les resultats |
| SHOP-DE-01 | "+45% de CA : etude de cas e-commerce Axiom" | Cas d'etude detaille | Decision | Promo | Voir l'etude complete |
| SHOP-DE-02 | "Audit Shopify gratuit : analyse de votre boutique en 30 min" | Landing page | Decision | Promo | Reserver un creneau |
| SHOP-DE-03 | "Tracking server-side : 990 EUR + 89 EUR/mois" | Landing page offre | Decision | Promo | Demarrer |

### 5.3 COLLECTIVITES

| ID | Titre | Format | Etape | Type | CTA |
|---|---|---|---|---|---|
| COLL-AW-01 | "RGAA 4.1 : ou en sont les collectivites en 2026 ?" | Article blog | Awareness | Valeur | Lire l'article |
| COLL-AW-02 | "Les 10 non-conformites RGAA les plus frequentes" | Infographic PDF | Awareness | Valeur | Telecharger |
| COLL-AW-03 | "Accessibilite web : obligations et echeances pour collectivites" | Guide juridique PDF | Awareness | Valeur | Telecharger |
| COLL-CO-01 | "Etude de cas : collectivite conforme RGAA en 6 mois" | Cas d'etude | Consideration | Valeur | Voir l'etude |
| COLL-CO-02 | "Comment rediger un cahier des charges RGAA" | Template Word | Consideration | Valeur | Telecharger le template |
| COLL-CO-03 | "RGAA : retour d'experience commune de 30K habitants" | Webinar replay | Consideration | Valeur | Voir le replay |
| COLL-DE-01 | "Preparer sa consultation RGAA : les 15 points cles" | Checklist PDF | Decision | Valeur | Telecharger |
| COLL-DE-02 | "RGAA et marches publics : criteres de selection" | Article expert | Decision | Valeur | Lire l'article |
| COLL-DE-03 | "Subventions mise en conformite RGAA 2026" | Guide financement | Decision | Valeur | Telecharger |
| COLL-DE-04 | "Axiom : expert RGAA collectivites, des 8 000 EUR" | Landing page offre | Decision | Promo | Demander un audit gratuit |

### 5.4 STARTUPS

| ID | Titre | Format | Etape | Type | CTA |
|---|---|---|---|---|---|
| START-AW-01 | "MVP 2026 : Flutter vs. React Native vs. natif" | Article comparatif | Awareness | Valeur | Lire l'article |
| START-AW-02 | "Timeline realiste d'un MVP : de l'idee au store" | Infographic PDF | Awareness | Valeur | Telecharger |
| START-CO-01 | "De 0 a 10K users en 4 mois avec Flutter" | Cas d'etude | Consideration | Valeur | Voir l'etude |
| START-CO-02 | "Les 5 erreurs fatales des startups qui outsourcent leur dev" | Article blog | Consideration | Valeur | Lire l'article |
| START-CO-03 | "Comment estimer le budget de votre app sans se planter" | Guide budget PDF | Consideration | Valeur | Telecharger |
| START-DE-01 | "Axiom : votre MVP en 8 semaines, des 15 000 EUR" | Landing page offre | Decision | Promo | Prendre RDV |
| START-DE-02 | "Temoignage startup : [Nom] a leve apres son MVP Axiom" | Video temoignage | Decision | Promo | Voir le temoignage |
| START-DE-03 | "30 min pour regarder votre projet ensemble — sans engagement" | Landing page | Decision | Promo | Reserver un creneau |

### 5.5 AGENCES WL

| ID | Titre | Format | Etape | Type | CTA |
|---|---|---|---|---|---|
| WL-AW-01 | "Pourquoi les agences qui sous-traitent le dev gagnent plus" | Article blog | Awareness | Valeur | Lire l'article |
| WL-AW-02 | "White Label dev web : comment ca marche concretement" | Infographic PDF | Awareness | Valeur | Telecharger |
| WL-CO-01 | "Agence parisienne x3 projets web grace au WL" | Cas d'etude | Consideration | Valeur | Voir l'etude |
| WL-CO-02 | "Comment presenter un devis web a votre client (quand c'est un partenaire qui dev)" | Guide PDF | Consideration | Valeur | Telecharger |
| WL-CO-03 | "IA dans le dev web : comment l'expliquer a vos clients" | Article blog | Consideration | Valeur | Lire l'article |
| WL-CO-04 | "Axiom WL : dev sous votre marque, votre marge" | Presentation PDF | Consideration | Promo | Voir la presentation |
| WL-DE-01 | "Catalogue prestations WL + grille tarifaire partenaire" | PDF confidentiel | Decision | Promo | Demander le catalogue |
| WL-DE-02 | "Temoignage agence partenaire WL Axiom" | Video temoignage | Decision | Valeur | Voir le temoignage |
| WL-DE-03 | "Premier projet WL : accompagnement premium offert" | Landing page offre | Decision | Promo | Demarrer un projet test |

### 5.6 Implementation du content pool

```typescript
// Mapping complet segment → etape → contenu
const CONTENT_POOLS: Record<string, Record<string, ContentPiece[]>> = {
  PME_METRO: {
    awareness: [
      {
        content_id: 'PME-AW-01',
        title: '5 erreurs frequentes sur les sites de PME en 2026',
        format: 'article',
        parcours_etape: 'awareness',
        segment: 'PME_METRO',
        type: 'valeur',
        subject_line_template: '{{prenom}}, ton site fait-il ces 5 erreurs ?',
        body_template: `Salut {{prenom}},

J'ai analyse plus de 200 sites de PME ces derniers mois, et les memes erreurs reviennent tout le temps.

La plus courante ? Un site qui met plus de 4 secondes a charger sur mobile. En 2026, ca coute cher en clients perdus.

J'ai compile les 5 erreurs les plus frequentes (et comment les corriger) dans cet article.

{{CTA}}

A bientot,
Jonathan — Axiom Marketing`,
        cta_text: 'Lire les 5 erreurs →',
        cta_url: 'https://axiom-marketing.fr/blog/5-erreurs-sites-pme',
        tags: ['site-vitrine', 'performance', 'mobile']
      },
      // ... autres contenus PME awareness
    ],
    consideration: [
      {
        content_id: 'PME-CO-01',
        title: '3 PME qui ont double leur CA en modernisant leur site',
        format: 'video',
        parcours_etape: 'consideration',
        segment: 'PME_METRO',
        type: 'valeur',
        subject_line_template: '{{prenom}}, 3 PME qui ont double leur CA (video)',
        body_template: `Salut {{prenom}},

Quand une PME modernise son site web, les resultats peuvent etre spectaculaires. Mais c'est plus facile a dire qu'a prouver.

Alors j'ai fait une video courte (3 min) avec les chiffres reels de 3 PME qui ont franchi le pas.

Spoiler : ce n'est pas juste une question de "faire joli".

{{CTA}}

Jonathan — Axiom Marketing`,
        cta_text: 'Voir la video (3 min) →',
        cta_url: 'https://axiom-marketing.fr/videos/3-pme-double-ca',
        tags: ['case-study', 'roi', 'refonte']
      },
      // ... autres contenus
    ],
    decision: [
      // ... contenus decision
    ]
  },
  ECOMMERCE_SHOPIFY: {
    awareness: [/* ... */],
    consideration: [/* ... */],
    decision: [/* ... */]
  },
  COLLECTIVITES: {
    awareness: [/* ... */],
    consideration: [/* ... */],
    decision: [/* ... */]
  },
  STARTUPS: {
    awareness: [/* ... */],
    consideration: [/* ... */],
    decision: [/* ... */]
  },
  AGENCES_WL: {
    awareness: [/* ... */],
    consideration: [/* ... */],
    decision: [/* ... */]
  }
}

function getContentPool(
  segment: string,
  parcours_etape: string,
  emailType: 'valeur' | 'promo'
): ContentPiece[] {
  const pool = CONTENT_POOLS[segment]?.[parcours_etape] || []
  return pool.filter(c => c.type === emailType)
}

async function getContentPiece(content_id: string): Promise<ContentPiece | null> {
  for (const segment of Object.values(CONTENT_POOLS)) {
    for (const etape of Object.values(segment)) {
      const found = etape.find(c => c.content_id === content_id)
      if (found) return found
    }
  }
  return null
}
```

---

## 6. RE-ENGAGEMENT DES LEADS INACTIFS

### 6.1 Definition d'un lead inactif

Un lead est considere **inactif** quand il n'a eu aucune interaction mesurable pendant une periode donnee :

| Critere | Seuil |
|---|---|
| Aucun email ouvert | 45 jours |
| Aucun clic | 60 jours |
| Aucune interaction (tous canaux) | 60 jours |
| Engagement score en baisse continue | 3 mois |

### 6.2 Detection automatique

```typescript
// Cron job hebdomadaire de detection des inactifs
async function detectInactiveProspects(): Promise<void> {
  console.log('[6] Detection des prospects inactifs...')

  // Marquer les prospects sans interaction depuis 60 jours
  const result = await pool.query(`
    UPDATE nurture_prospects SET
      inactive_since = COALESCE(inactive_since, NOW()),
      updated_at = NOW()
    WHERE nurture_status = 'ACTIVE'
      AND last_interaction_at < NOW() - INTERVAL '60 days'
      AND inactive_since IS NULL
    RETURNING prospect_id
  `)

  console.log(`[6] ${result.rows.length} prospects marques inactifs`)

  // Pour chaque inactif, demarrer le workflow de re-engagement
  for (const row of result.rows) {
    await startReEngagementWorkflow(row.prospect_id)
  }
}
```

### 6.3 Workflow de re-engagement (3 emails)

```
Jour 0 : Detection inactive_since >= 60 jours
     |
Jour 1 : Email de re-engagement #1 (le "on pense a toi")
     |
     +-- Si ouvert → Retour en sequence normale, reset inactive_since
     |
Jour 8 : Email de re-engagement #2 (le "contenu premium exclusif")
     |
     +-- Si ouvert → Retour en sequence normale
     |
Jour 15 : Email de re-permission (le "tu veux toujours recevoir nos emails ?")
     |
     +-- Si clic "OUI" → Retour en sequence normale
     +-- Si clic "NON" ou pas de reaction → Sunset
```

### 6.4 Templates de re-engagement

#### Email Re-engagement #1 : "On pense a toi"

```typescript
const RE_ENGAGEMENT_1: Record<string, ContentPiece> = {
  PME_METRO: {
    content_id: 'RE-PME-01',
    title: 'On se fait un point rapide ?',
    format: 'article',
    parcours_etape: 'awareness',
    segment: 'PME_METRO',
    type: 'valeur',
    subject_line_template: '{{prenom}}, un truc qui pourrait t\'interesser',
    body_template: `Salut {{prenom}},

Ca fait un moment qu'on ne s'est pas parle.

Depuis, pas mal de choses ont bouge dans le web pour les PME. En particulier : Google a (encore) change les regles du jeu pour les sites mobiles.

J'ai resume les 3 changements les plus importants dans un article rapide.

{{CTA}}

Si ca ne t'interesse plus, aucun souci — pas de rancune.

Jonathan — Axiom Marketing`,
    cta_text: 'Voir les 3 changements →',
    cta_url: 'https://axiom-marketing.fr/blog/google-mobile-2026',
    tags: ['re-engagement', 'google', 'mobile']
  },
  ECOMMERCE_SHOPIFY: {
    content_id: 'RE-SHOP-01',
    title: 'Les chiffres Shopify Q1 2026 sont tombes',
    format: 'article',
    parcours_etape: 'awareness',
    segment: 'ECOMMERCE_SHOPIFY',
    type: 'valeur',
    subject_line_template: '{{prenom}}, les tendances Shopify que tes concurrents connaissent deja',
    body_template: `Salut {{prenom}},

Ca fait un moment — j'espere que ta boutique tourne bien.

Les chiffres du Q1 2026 pour Shopify sont sortis, et il y a des surprises. Notamment sur le tracking server-side : les marchands qui l'ont adopte voient leur ROAS grimper de 15-25%.

J'ai resume les tendances cles dans un article.

{{CTA}}

Jonathan — Axiom Marketing`,
    cta_text: 'Voir les tendances Q1 →',
    cta_url: 'https://axiom-marketing.fr/blog/tendances-shopify-q1-2026',
    tags: ['re-engagement', 'shopify', 'tracking']
  },
  COLLECTIVITES: {
    content_id: 'RE-COLL-01',
    title: 'Mise a jour echeances RGAA 2026',
    format: 'guide',
    parcours_etape: 'awareness',
    segment: 'COLLECTIVITES',
    type: 'valeur',
    subject_line_template: '{{prenom}}, nouvelle echeance RGAA — votre collectivite est concernee',
    body_template: `Bonjour {{prenom}},

Les echeances de conformite RGAA ont ete mises a jour pour 2026. Certaines collectivites sont desormais en premiere ligne.

J'ai synthetise les nouvelles obligations et le calendrier dans un document de 2 pages.

{{CTA}}

Bien cordialement,
Jonathan — Axiom Marketing`,
    cta_text: 'Voir les nouvelles echeances →',
    cta_url: 'https://axiom-marketing.fr/guides/echeances-rgaa-2026',
    tags: ['re-engagement', 'rgaa', 'echeances']
  },
  STARTUPS: {
    content_id: 'RE-START-01',
    title: 'Flutter 2026 : les nouvelles features qui changent tout',
    format: 'article',
    parcours_etape: 'awareness',
    segment: 'STARTUPS',
    type: 'valeur',
    subject_line_template: '{{prenom}}, Flutter vient de sortir un truc enorme',
    body_template: `Salut {{prenom}},

Ca fait un moment ! J'ai un truc qui devrait t'interesser si tu reflechis toujours a ton app.

Flutter a sorti des features en debut d'annee qui changent pas mal la donne pour les startups : Impeller (rendering engine), web assembly, et de l'IA embarquee.

En resume : des apps plus rapides, moins cheres a developper.

{{CTA}}

Jonathan — Axiom Marketing`,
    cta_text: 'Voir ce qui a change →',
    cta_url: 'https://axiom-marketing.fr/blog/flutter-2026-features',
    tags: ['re-engagement', 'flutter', 'mobile']
  },
  AGENCES_WL: {
    content_id: 'RE-WL-01',
    title: 'Les agences qui sous-traitent gagnent la course',
    format: 'article',
    parcours_etape: 'awareness',
    segment: 'AGENCES_WL',
    type: 'valeur',
    subject_line_template: '{{prenom}}, les agences qui scalent en 2026 font toutes ca',
    body_template: `Salut {{prenom}},

Ca fait un moment qu'on ne s'est pas parle. Un chiffre qui m'a frappe recemment : les agences de communication qui sous-traitent leur dev ont une marge nette 35% superieure a celles qui internalisent.

Le modele WL continue de faire ses preuves.

J'ai decortique les chiffres dans un article.

{{CTA}}

Jonathan — Axiom Marketing`,
    cta_text: 'Voir l\'analyse →',
    cta_url: 'https://axiom-marketing.fr/blog/agences-wl-marge-2026',
    tags: ['re-engagement', 'white-label', 'marge']
  }
}
```

#### Email Re-engagement #2 : "Contenu premium exclusif"

```typescript
const RE_ENGAGEMENT_2: Record<string, ContentPiece> = {
  PME_METRO: {
    content_id: 'RE-PME-02',
    title: 'Guide exclusif : audit express de votre site',
    format: 'guide',
    parcours_etape: 'consideration',
    segment: 'PME_METRO',
    type: 'valeur',
    subject_line_template: '{{prenom}}, un outil que je reserve normalement a mes clients',
    body_template: `Salut {{prenom}},

J'ai cree un outil d'auto-audit que j'utilise normalement en interne pour evaluer les sites de mes clients.

10 questions, 5 minutes, et tu sais exactement ou ton site en est (vitesse, mobile, SEO, conversion).

Je le partage exceptionnellement.

{{CTA}}

Jonathan — Axiom Marketing`,
    cta_text: 'Faire l\'audit express (5 min) →',
    cta_url: 'https://axiom-marketing.fr/tools/auto-audit',
    tags: ['re-engagement', 'audit', 'outil']
  },
  // ... memes patterns pour les autres segments
}
```

#### Email Re-permission : "Tu veux toujours ?"

```typescript
const RE_PERMISSION_EMAIL = {
  subject_line_template: '{{prenom}}, on continue ?',
  body_template: `Salut {{prenom}},

Ca fait un moment que tu n'as pas ouvert mes emails. Pas de souci — je comprends que les priorites changent.

Plutot que de continuer a t'envoyer des trucs qui ne t'interessent pas, je prefere te poser la question directement :

→ OUI, je veux continuer a recevoir tes contenus : {{CTA_YES}}
→ NON, tu peux me retirer de ta liste : {{CTA_NO}}

Si je n'ai pas de reponse d'ici 7 jours, je te retire automatiquement. Pas de spam, c'est promis.

Jonathan — Axiom Marketing`,
  cta_yes_url: 'https://axiom-marketing.fr/reconfirm?id={{prospect_id}}&action=yes',
  cta_no_url: 'https://axiom-marketing.fr/unsubscribe?id={{prospect_id}}&action=no'
}
```

### 6.5 Code du workflow de re-engagement

```typescript
async function startReEngagementWorkflow(prospect_id: string): Promise<void> {
  const prospect = await loadNurtureProspect(prospect_id)
  if (!prospect) return

  // Verifier qu'on n'a pas deja lance un re-engagement
  const existingReEngagement = await pool.query(`
    SELECT COUNT(*) as count
    FROM nurture_interactions
    WHERE prospect_id = $1
      AND interaction_type = 'RE_ENGAGEMENT_SENT'
      AND created_at > NOW() - INTERVAL '90 days'
  `, [prospect_id])

  if (parseInt(existingReEngagement.rows[0].count) > 0) {
    // Deja eu un re-engagement recent → passer directement au sunset
    console.log(`[6] Re-engagement deja tente pour ${prospect_id}, passage en sunset`)
    await startSunsetProcess(prospect_id)
    return
  }

  // Email #1 : J+0
  const reEngContent1 = RE_ENGAGEMENT_1[prospect.segment]
  if (reEngContent1) {
    await nurturerEmailQueue.add(
      `re-engage-1-${prospect_id}`,
      {
        prospect_id,
        sequence_type: 'RE_ENGAGEMENT',
        step_number: 1,
        content_piece: reEngContent1,
        parcours_etape: 'awareness',
        attempt: 1,
        previous_behavior: null
      }
    )
  }

  // Email #2 : J+8
  const reEngContent2 = RE_ENGAGEMENT_2[prospect.segment]
  if (reEngContent2) {
    await nurturerEmailQueue.add(
      `re-engage-2-${prospect_id}`,
      {
        prospect_id,
        sequence_type: 'RE_ENGAGEMENT',
        step_number: 2,
        content_piece: reEngContent2,
        parcours_etape: 'consideration',
        attempt: 1,
        previous_behavior: null
      },
      { delay: 8 * 86400000 }
    )
  }

  // Email re-permission : J+15
  await nurturerEmailQueue.add(
    `re-permission-${prospect_id}`,
    {
      prospect_id,
      sequence_type: 'RE_PERMISSION',
      step_number: 3,
      content_piece: {
        content_id: 'RE-PERM-01',
        title: 'Re-permission',
        format: 'article' as const,
        parcours_etape: 'awareness' as const,
        segment: prospect.segment,
        type: 'valeur' as const,
        subject_line_template: RE_PERMISSION_EMAIL.subject_line_template,
        body_template: RE_PERMISSION_EMAIL.body_template
          .replace('{{CTA_YES}}', RE_PERMISSION_EMAIL.cta_yes_url.replace('{{prospect_id}}', prospect_id))
          .replace('{{CTA_NO}}', RE_PERMISSION_EMAIL.cta_no_url.replace('{{prospect_id}}', prospect_id)),
        cta_text: 'Gerer mes preferences',
        cta_url: RE_PERMISSION_EMAIL.cta_yes_url.replace('{{prospect_id}}', prospect_id),
        tags: ['re-permission']
      },
      parcours_etape: 'awareness',
      attempt: 1,
      previous_behavior: null
    },
    { delay: 15 * 86400000 }
  )

  // Marquer comme re-engagement en cours
  await pool.query(`
    UPDATE nurture_prospects SET
      nurture_status = 'RE_ENGAGED',
      updated_at = NOW()
    WHERE prospect_id = $1
  `, [prospect_id])

  // Logger
  await logNurtureInteraction({
    prospect_id,
    interaction_type: 'RE_ENGAGEMENT_SENT',
    canal: 'system',
    details: { workflow: 'started', emails_planned: 3 },
    score_delta: 0,
    score_after: prospect.engagement_score_current
  })

  // Planifier la verification sunset a J+22 (7 jours apres re-permission)
  await rescoreQueue.add(
    `sunset-check-${prospect_id}`,
    {
      type: 'IMMEDIATE',
      prospect_id,
      trigger_reason: 'post_re_engagement_check'
    },
    { delay: 22 * 86400000 }
  )
}

// Handler pour les webhooks de re-confirmation
async function handleReConfirmation(prospect_id: string, action: 'yes' | 'no'): Promise<void> {
  if (action === 'yes') {
    // Le prospect veut continuer
    await pool.query(`
      UPDATE nurture_prospects SET
        nurture_status = 'ACTIVE',
        inactive_since = NULL,
        consent_status = 'OPT_IN',
        updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect_id])

    await updateEngagementScore(prospect_id, 'RE_CONFIRMATION_YES', 10)
  } else {
    // Le prospect veut se desinscrire
    await handleOptOut(prospect_id, 're_permission_no')
  }
}
```

---

## 7. SUNSET POLICY

### 7.1 Criteres d'abandon definitif

Un prospect est place en **sunset** (abandon definitif) quand il remplit au moins un de ces criteres :

| Critere | Seuil | Action |
|---|---|---|
| Inactif apres re-engagement (3 emails + re-permission) | 22 jours apres debut re-engagement | Archive |
| Aucune interaction en 180 jours (tous canaux) | 180 jours | Archive |
| Hard bounce email | Immediat | Suppression email, archive prospect |
| Opt-out explicite | Immediat | Suppression RGPD |
| Engagement score = 0 apres 6 mois de nurture | 6 mois | Archive |
| Entreprise fermee / prospect parti | Detection via re-scoring | Archive |

### 7.2 Timelines

```
Prospect entre en nurture (J0)
     |
     +-- Sequence nurture active (J0 → J60-120 selon segment)
     |
     +-- Si inactif a J60 : Detection + debut re-engagement
     |        |
     |        +-- Re-engagement email #1 (J60)
     |        +-- Re-engagement email #2 (J68)
     |        +-- Re-permission email (J75)
     |        +-- Sunset si pas de reaction (J82)
     |
     +-- Si actif mais pas de conversion a J180 : Re-scoring
     |        |
     |        +-- Si score > warm_threshold → continuer
     |        +-- Si score < cold_threshold → sunset
     |
     +-- Sunset maximum absolu : J365 (1 an de nurture max)
```

### 7.3 Actions de sunset

```typescript
async function startSunsetProcess(prospect_id: string): Promise<void> {
  const prospect = await loadNurtureProspect(prospect_id)
  if (!prospect) return

  console.log(`[6] Sunset process pour ${prospect_id}`)

  // 1. Stopper tous les jobs planifies
  const jobIds = [
    `nurture-email-${prospect_id}*`,
    `re-engage-*-${prospect_id}`,
    `re-permission-${prospect_id}`,
    `linkedin-engage-${prospect_id}`,
    `rescore-*-${prospect_id}`
  ]

  for (const pattern of jobIds) {
    // Supprimer les jobs en attente
    const jobs = await nurturerEmailQueue.getJobs(['delayed', 'waiting'])
    for (const job of jobs) {
      if (job.name?.includes(prospect_id)) {
        await job.remove()
      }
    }
  }

  // 2. Mettre a jour le statut
  await pool.query(`
    UPDATE nurture_prospects SET
      nurture_status = 'SUNSET',
      data_retention_until = NOW() + INTERVAL '3 years',  -- RGPD : 3 ans max
      updated_at = NOW()
    WHERE prospect_id = $1
  `, [prospect_id])

  // 3. Logger l'evenement
  await logNurtureInteraction({
    prospect_id,
    interaction_type: 'SUNSET',
    canal: 'system',
    details: {
      reason: 'no_engagement_after_re_engagement',
      nurture_duration_days: daysBetween(new Date(prospect.created_at), new Date()),
      total_emails_sent: prospect.emails_nurture_sent,
      total_emails_opened: prospect.emails_opened,
      final_engagement_score: prospect.engagement_score_current
    },
    score_delta: 0,
    score_after: 0
  })

  // 4. Envoyer la metrique a l'Agent 7
  await emitNurtureMetric({
    event: 'SUNSET',
    prospect_id,
    segment: prospect.segment,
    nurture_duration_days: daysBetween(new Date(prospect.created_at), new Date()),
    final_score: prospect.engagement_score_current
  })
}

// Opt-out explicite → suppression RGPD
async function handleOptOut(prospect_id: string, source: string): Promise<void> {
  console.log(`[6] Opt-out pour ${prospect_id} via ${source}`)

  // 1. Stopper tous les envois
  await startSunsetProcess(prospect_id)

  // 2. Mettre a jour le statut RGPD
  await pool.query(`
    UPDATE nurture_prospects SET
      nurture_status = 'OPTED_OUT',
      consent_status = 'OPTED_OUT',
      opt_out_at = NOW(),
      data_retention_until = NOW() + INTERVAL '30 days',  -- Suppression dans 30 jours
      updated_at = NOW()
    WHERE prospect_id = $1
  `, [prospect_id])

  // 3. Marquer dans la table prospects principale
  await pool.query(`
    UPDATE prospects SET
      email_opt_out = true,
      opt_out_at = NOW(),
      opt_out_source = $1,
      updated_at = NOW()
    WHERE prospect_id = $2
  `, [source, prospect_id])

  // 4. Logger
  await logNurtureInteraction({
    prospect_id,
    interaction_type: 'OPT_OUT',
    canal: 'system',
    details: { source, rgpd_deletion_scheduled: true },
    score_delta: 0,
    score_after: 0
  })
}

// Cron job quotidien : suppression RGPD des donnees expirees
async function processRGPDDeletions(): Promise<void> {
  console.log('[6] RGPD : verification des suppressions planifiees...')

  // Prospects opt-out dont le delai de retention est expire
  const expiredOptOuts = await pool.query(`
    SELECT prospect_id
    FROM nurture_prospects
    WHERE consent_status = 'OPTED_OUT'
      AND data_retention_until <= NOW()
  `)

  for (const row of expiredOptOuts.rows) {
    await deleteProspectData(row.prospect_id)
  }

  // Prospects sunset dont la retention est expiree (3 ans)
  const expiredSunsets = await pool.query(`
    SELECT prospect_id
    FROM nurture_prospects
    WHERE nurture_status = 'SUNSET'
      AND data_retention_until <= NOW()
  `)

  for (const row of expiredSunsets.rows) {
    await archiveProspectData(row.prospect_id)
  }

  console.log(`[6] RGPD : ${expiredOptOuts.rows.length} suppressions, ${expiredSunsets.rows.length} archivages`)
}

async function deleteProspectData(prospect_id: string): Promise<void> {
  // Suppression totale (droit a l'oubli RGPD)
  await pool.query('BEGIN')
  try {
    // Supprimer les interactions
    await pool.query('DELETE FROM nurture_interactions WHERE prospect_id = $1', [prospect_id])
    // Supprimer les emails nurture
    await pool.query('DELETE FROM nurture_emails WHERE prospect_id = $1', [prospect_id])
    // Supprimer le prospect nurture
    await pool.query('DELETE FROM nurture_prospects WHERE prospect_id = $1', [prospect_id])
    // Anonymiser dans la table prospects principale (garder des stats anonymes)
    await pool.query(`
      UPDATE prospects SET
        prenom = 'SUPPRIME',
        nom = 'RGPD',
        email = 'deleted-' || prospect_id || '@deleted.local',
        telephone = NULL,
        linkedin_url = NULL,
        poste = NULL,
        updated_at = NOW()
      WHERE prospect_id = $1
    `, [prospect_id])

    await pool.query('COMMIT')
    console.log(`[6] RGPD : prospect ${prospect_id} supprime`)
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error(`[6] RGPD suppression echouee pour ${prospect_id}:`, err)
    throw err
  }
}

async function archiveProspectData(prospect_id: string): Promise<void> {
  // Archivage (pas suppression totale, juste anonymisation)
  await pool.query(`
    UPDATE nurture_prospects SET
      consent_status = 'DELETED',
      nurture_status = 'ARCHIVED',
      updated_at = NOW()
    WHERE prospect_id = $1
  `, [prospect_id])
}
```

### 7.4 Regle de non-recontact

Un prospect en sunset ou opt-out ne doit JAMAIS etre recontacte :

```typescript
// Guard a appeler avant tout envoi ou interaction
async function canContactProspect(prospect_id: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT nurture_status, consent_status
    FROM nurture_prospects
    WHERE prospect_id = $1
  `, [prospect_id])

  if (result.rows.length === 0) return true // Pas en nurture

  const { nurture_status, consent_status } = result.rows[0]

  if (consent_status === 'OPTED_OUT' || consent_status === 'DELETED') return false
  if (nurture_status === 'SUNSET' || nurture_status === 'ARCHIVED') return false
  if (nurture_status === 'OPTED_OUT') return false

  // Verifier aussi dans la table prospects principale
  const mainCheck = await pool.query(`
    SELECT email_opt_out FROM prospects WHERE prospect_id = $1
  `, [prospect_id])

  if (mainCheck.rows[0]?.email_opt_out) return false

  return true
}
```

---

## 8. METRIQUES

### 8.1 KPIs specifiques au nurturing

Les metriques du nurturing sont DIFFERENTES de celles de la prospection active (Agent 5). Le nurturing se mesure sur la longueur.

| KPI | Formule | Benchmark Axiom cible | Frequence |
|---|---|---|---|
| **Taux d'ouverture nurture** | Emails ouverts / Emails envoyes | > 25% | Hebdo |
| **Taux de clic nurture** | Clics / Emails envoyes | > 4% | Hebdo |
| **Taux de download** | Downloads / Emails envoyes | > 2% | Mensuel |
| **Taux de reponse nurture** | Reponses / Emails envoyes | > 1.5% | Mensuel |
| **Taux de reclassification** | Prospects reclassifies HOT / Total en nurture | > 5% | Mensuel |
| **Delai moyen de maturation** | Jours entre entree nurture et reclassification HOT | < 90 jours | Mensuel |
| **Taux de sunset** | Prospects sunset / Total entres en nurture | < 60% | Trimestriel |
| **Taux d'opt-out** | Opt-outs / Total en nurture | < 2% | Mensuel |
| **Score moyen d'engagement** | Moyenne des scores d'engagement actifs | > 30 | Mensuel |
| **Taux de re-engagement** | Inactifs re-actives / Inactifs detectes | > 15% | Mensuel |
| **Contribution au pipeline** | CA genere par leads nurtured / CA total | > 20% | Trimestriel |
| **Cout par lead nurture reclassifie** | Couts nurture / Leads reclassifies HOT | < 10 EUR | Mensuel |

### 8.2 Dashboard mensuel

```typescript
interface NurtureDashboard {
  periode: {
    debut: string
    fin: string
  }

  // Vue d'ensemble
  overview: {
    total_en_nurture: number
    nouveaux_entrants: number           // Depuis Agent 5 ce mois
    reclassifies_hot: number            // Renvoyes au pipeline
    sunset_ce_mois: number
    opt_outs_ce_mois: number
    taux_attrition: number              // (sunset + opt-out) / total
  }

  // Engagement email
  email: {
    emails_envoyes: number
    taux_ouverture: number
    taux_clic: number
    taux_download: number
    taux_reponse: number
    meilleur_contenu: {
      content_id: string
      title: string
      taux_ouverture: number
      taux_clic: number
    }
    pire_contenu: {
      content_id: string
      title: string
      taux_ouverture: number
      taux_clic: number
    }
  }

  // Engagement LinkedIn
  linkedin: {
    likes_donnes: number
    comments_donnes: number
    reactions_recues: number            // Prospects qui ont reagi a nos comments
    prospects_engages: number
  }

  // Re-scoring
  rescoring: {
    rescores_effectues: number
    reclassifications: {
      cold_to_warm: number
      warm_to_hot: number
      cold_to_hot: number
      degradations: number
    }
    signaux_detectes: number
    score_moyen: number
  }

  // Par segment
  par_segment: Record<string, {
    en_nurture: number
    reclassifies: number
    taux_engagement: number
    score_moyen: number
    delai_moyen_maturation_jours: number | null
  }>

  // Par etape parcours
  par_parcours: {
    awareness: number
    consideration: number
    decision: number
  }

  // Funnel nurture
  funnel: {
    entres_en_nurture: number
    actifs_30j: number
    engagement_positif: number          // Au moins 1 ouverture
    consideration: number               // Avances en consideration
    decision: number                    // Avances en decision
    reclassifies_hot: number            // Conversion nurture
  }

  // Couts
  couts: {
    claude_api_personnalisation: number  // EUR
    infrastructure: number               // EUR
    total: number                        // EUR
    cout_par_lead_reclassifie: number    // EUR
  }
}

// Vue SQL pour le dashboard
const NURTURE_DASHBOARD_SQL = `
-- Vue synthese nurture mensuelle
CREATE OR REPLACE VIEW v_nurture_dashboard_monthly AS
SELECT
  DATE_TRUNC('month', np.created_at) as mois_entree,
  np.segment,
  np.scoring_categorie,
  np.nurture_status,
  np.parcours_etape,
  COUNT(*) as total,
  AVG(np.engagement_score_current) as score_moyen,
  AVG(np.emails_nurture_sent) as emails_moyen,
  AVG(np.emails_opened) as ouvertures_moyen,
  SUM(CASE WHEN np.nurture_status = 'RECLASSIFIED_HOT' THEN 1 ELSE 0 END) as reclassifies_hot,
  SUM(CASE WHEN np.nurture_status = 'SUNSET' THEN 1 ELSE 0 END) as sunsets,
  SUM(CASE WHEN np.nurture_status = 'OPTED_OUT' THEN 1 ELSE 0 END) as opt_outs,
  AVG(CASE WHEN np.nurture_status = 'RECLASSIFIED_HOT'
    THEN EXTRACT(EPOCH FROM (np.updated_at - np.created_at)) / 86400
    ELSE NULL END
  ) as delai_moyen_maturation_jours
FROM nurture_prospects np
GROUP BY DATE_TRUNC('month', np.created_at), np.segment, np.scoring_categorie,
         np.nurture_status, np.parcours_etape;

-- Vue performance contenu
CREATE OR REPLACE VIEW v_nurture_content_performance AS
SELECT
  ne.content_piece_id,
  ne.parcours_etape,
  np.segment,
  COUNT(*) as total_envoyes,
  COUNT(*) FILTER (WHERE ne.status IN ('OPENED', 'CLICKED', 'REPLIED')) as total_ouverts,
  COUNT(*) FILTER (WHERE ne.status IN ('CLICKED', 'REPLIED')) as total_cliques,
  COUNT(*) FILTER (WHERE ne.status = 'REPLIED') as total_reponses,
  ROUND(
    COUNT(*) FILTER (WHERE ne.status IN ('OPENED', 'CLICKED', 'REPLIED'))::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as taux_ouverture_pct,
  ROUND(
    COUNT(*) FILTER (WHERE ne.status IN ('CLICKED', 'REPLIED'))::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as taux_clic_pct
FROM nurture_emails ne
JOIN nurture_prospects np ON np.prospect_id = ne.prospect_id
GROUP BY ne.content_piece_id, ne.parcours_etape, np.segment;

-- Vue funnel nurture
CREATE OR REPLACE VIEW v_nurture_funnel AS
SELECT
  np.segment,
  COUNT(*) as total_entres,
  COUNT(*) FILTER (WHERE np.last_interaction_at > NOW() - INTERVAL '30 days') as actifs_30j,
  COUNT(*) FILTER (WHERE np.emails_opened > 0) as engagement_positif,
  COUNT(*) FILTER (WHERE np.parcours_etape = 'consideration') as en_consideration,
  COUNT(*) FILTER (WHERE np.parcours_etape = 'decision') as en_decision,
  COUNT(*) FILTER (WHERE np.nurture_status = 'RECLASSIFIED_HOT') as reclassifies_hot,
  ROUND(
    COUNT(*) FILTER (WHERE np.nurture_status = 'RECLASSIFIED_HOT')::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as taux_conversion_nurture_pct
FROM nurture_prospects np
GROUP BY np.segment;

-- Vue taux d'engagement par semaine
CREATE OR REPLACE VIEW v_nurture_engagement_weekly AS
SELECT
  DATE_TRUNC('week', ni.created_at) as semaine,
  ni.interaction_type,
  ni.canal,
  COUNT(*) as total,
  COUNT(DISTINCT ni.prospect_id) as prospects_uniques
FROM nurture_interactions ni
WHERE ni.created_at > NOW() - INTERVAL '3 months'
GROUP BY DATE_TRUNC('week', ni.created_at), ni.interaction_type, ni.canal
ORDER BY semaine DESC;
`

// Generateur de rapport mensuel
async function generateMonthlyReport(): Promise<NurtureDashboard> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // Overview
  const overview = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE nurture_status IN ('ACTIVE', 'RE_ENGAGED')) as total_actifs,
      COUNT(*) FILTER (WHERE created_at >= $1) as nouveaux_entrants,
      COUNT(*) FILTER (WHERE nurture_status = 'RECLASSIFIED_HOT' AND updated_at >= $1) as reclassifies_hot,
      COUNT(*) FILTER (WHERE nurture_status = 'SUNSET' AND updated_at >= $1) as sunset_ce_mois,
      COUNT(*) FILTER (WHERE nurture_status = 'OPTED_OUT' AND updated_at >= $1) as opt_outs_ce_mois
    FROM nurture_prospects
  `, [monthStart.toISOString()])

  // Email metrics
  const emailMetrics = await pool.query(`
    SELECT
      COUNT(*) as total_envoyes,
      COUNT(*) FILTER (WHERE status IN ('OPENED', 'CLICKED', 'REPLIED')) as total_ouverts,
      COUNT(*) FILTER (WHERE status IN ('CLICKED', 'REPLIED')) as total_cliques,
      COUNT(*) FILTER (WHERE status = 'REPLIED') as total_reponses
    FROM nurture_emails
    WHERE sent_at >= $1 AND sent_at <= $2
  `, [monthStart.toISOString(), monthEnd.toISOString()])

  // LinkedIn metrics
  const linkedInMetrics = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE interaction_type = 'LINKEDIN_LIKE') as likes,
      COUNT(*) FILTER (WHERE interaction_type = 'LINKEDIN_COMMENT') as comments,
      COUNT(DISTINCT prospect_id) as prospects_engages
    FROM nurture_interactions
    WHERE created_at >= $1 AND created_at <= $2
      AND interaction_type IN ('LINKEDIN_LIKE', 'LINKEDIN_COMMENT')
  `, [monthStart.toISOString(), monthEnd.toISOString()])

  const o = overview.rows[0]
  const e = emailMetrics.rows[0]
  const l = linkedInMetrics.rows[0]

  return {
    periode: {
      debut: monthStart.toISOString(),
      fin: monthEnd.toISOString()
    },
    overview: {
      total_en_nurture: parseInt(o.total_actifs),
      nouveaux_entrants: parseInt(o.nouveaux_entrants),
      reclassifies_hot: parseInt(o.reclassifies_hot),
      sunset_ce_mois: parseInt(o.sunset_ce_mois),
      opt_outs_ce_mois: parseInt(o.opt_outs_ce_mois),
      taux_attrition: (parseInt(o.sunset_ce_mois) + parseInt(o.opt_outs_ce_mois)) /
        Math.max(1, parseInt(o.total_actifs)) * 100
    },
    email: {
      emails_envoyes: parseInt(e.total_envoyes),
      taux_ouverture: parseInt(e.total_ouverts) / Math.max(1, parseInt(e.total_envoyes)) * 100,
      taux_clic: parseInt(e.total_cliques) / Math.max(1, parseInt(e.total_envoyes)) * 100,
      taux_download: 0, // A calculer separement
      taux_reponse: parseInt(e.total_reponses) / Math.max(1, parseInt(e.total_envoyes)) * 100,
      meilleur_contenu: { content_id: '', title: '', taux_ouverture: 0, taux_clic: 0 },
      pire_contenu: { content_id: '', title: '', taux_ouverture: 0, taux_clic: 0 }
    },
    linkedin: {
      likes_donnes: parseInt(l.likes),
      comments_donnes: parseInt(l.comments),
      reactions_recues: 0,
      prospects_engages: parseInt(l.prospects_engages)
    },
    rescoring: {
      rescores_effectues: 0,
      reclassifications: { cold_to_warm: 0, warm_to_hot: 0, cold_to_hot: 0, degradations: 0 },
      signaux_detectes: 0,
      score_moyen: 0
    },
    par_segment: {},
    par_parcours: { awareness: 0, consideration: 0, decision: 0 },
    funnel: {
      entres_en_nurture: 0, actifs_30j: 0, engagement_positif: 0,
      consideration: 0, decision: 0, reclassifies_hot: 0
    },
    couts: {
      claude_api_personnalisation: 0, infrastructure: 0, total: 0, cout_par_lead_reclassifie: 0
    }
  }
}
```

---

## 9. SCORING D'ENGAGEMENT

### 9.1 Points attribues par action

| Action | Points | Type | Canal | Frequence max |
|---|---|---|---|---|
| Email ouvert | +2 | Engagement passif | Email | 1 par email |
| Email clique (lien) | +5 | Engagement actif | Email | 1 par email |
| Contenu telecharge (PDF, guide) | +8 | Engagement fort | Email | Illimite |
| Email reply (toute reponse) | +15 | Engagement tres fort | Email | 1 par email |
| Visite page pricing/tarifs | +10 | Signal d'achat | Web | 1 par jour |
| Visite site (autre page) | +3 | Engagement passif | Web | 1 par jour |
| Like LinkedIn (prospect like un post Axiom) | +4 | Engagement reciproque | LinkedIn | Illimite |
| Comment LinkedIn (prospect commente) | +8 | Engagement fort | LinkedIn | Illimite |
| Demande de contact spontanee | +25 | Conversion | Multi | Illimite |
| Inscription webinar/event | +12 | Engagement fort | Email/Web | Illimite |
| Re-confirmation opt-in | +10 | Re-engagement | Email | 1 |

### 9.2 Decay (decroissance naturelle)

Le score d'engagement decroit naturellement en l'absence d'interactions :

| Periode d'inactivite | Decay |
|---|---|
| 7 jours sans interaction | -1 point |
| 14 jours sans interaction | -2 points |
| 30 jours sans interaction | -5 points |
| 60 jours sans interaction | -10 points |
| 90 jours sans interaction | -20 points |

### 9.3 Seuils de reclassification

| Score d'engagement | Categorie | Action |
|---|---|---|
| >= 75 | HOT | Renvoyer au Scoreur (Agent 3) pour re-routing pipeline actif |
| 40 - 74 | WARM | Accelerer la frequence nurture, passer a consideration/decision |
| 15 - 39 | WARM (faible) | Maintenir la sequence, surveiller |
| 1 - 14 | COLD | Ralentir la frequence, contenu awareness uniquement |
| 0 | SUNSET candidat | Declencher workflow de re-engagement |

### 9.4 Implementation

```typescript
async function updateEngagementScore(
  prospect_id: string,
  action: string,
  points: number
): Promise<number> {
  // Charger le score actuel
  const result = await pool.query(`
    SELECT engagement_score_current, scoring_categorie
    FROM nurture_prospects
    WHERE prospect_id = $1
  `, [prospect_id])

  if (result.rows.length === 0) return 0

  const currentScore = result.rows[0].engagement_score_current
  const currentCategorie = result.rows[0].scoring_categorie

  // Calculer le nouveau score (min 0, max 100)
  const newScore = Math.min(100, Math.max(0, currentScore + points))

  // Determiner la nouvelle categorie
  let newCategorie: string
  if (newScore >= RESCORE_CONFIG.hot_threshold) {
    newCategorie = 'HOT'
  } else if (newScore >= RESCORE_CONFIG.warm_threshold) {
    newCategorie = 'WARM'
  } else {
    newCategorie = 'COLD'
  }

  // Mettre a jour en base
  await pool.query(`
    UPDATE nurture_prospects SET
      engagement_score_current = $1,
      scoring_categorie = $2,
      last_score_update = NOW(),
      updated_at = NOW()
    WHERE prospect_id = $3
  `, [newScore, newCategorie, prospect_id])

  // Logger l'interaction de scoring
  await pool.query(`
    INSERT INTO nurture_interactions (prospect_id, interaction_type, canal, details, score_delta, score_after)
    VALUES ($1, $2, 'system', $3, $4, $5)
  `, [
    prospect_id,
    action,
    JSON.stringify({ action, points, previous_score: currentScore }),
    points,
    newScore
  ])

  // Si reclassification detectee
  if (newCategorie !== currentCategorie) {
    await logNurtureInteraction({
      prospect_id,
      interaction_type: 'RECLASSIFIED',
      canal: 'system',
      details: {
        from: currentCategorie,
        to: newCategorie,
        trigger_action: action,
        score: newScore
      },
      score_delta: 0,
      score_after: newScore
    })

    // Si HOT → trigger re-routing
    if (newCategorie === 'HOT' && currentCategorie !== 'HOT') {
      await triggerImmediateRescore(prospect_id, `engagement_reclassified_hot_via_${action}`)
    }
  }

  return newScore
}

// Cron job hebdomadaire : decay des scores
async function applyEngagementDecay(): Promise<void> {
  console.log('[6] Application du decay d\'engagement...')

  // -1 pour ceux inactifs depuis 7 jours
  await pool.query(`
    UPDATE nurture_prospects SET
      engagement_score_current = GREATEST(0, engagement_score_current - 1),
      updated_at = NOW()
    WHERE nurture_status = 'ACTIVE'
      AND last_interaction_at < NOW() - INTERVAL '7 days'
      AND last_interaction_at >= NOW() - INTERVAL '14 days'
  `)

  // -2 pour ceux inactifs depuis 14 jours
  await pool.query(`
    UPDATE nurture_prospects SET
      engagement_score_current = GREATEST(0, engagement_score_current - 2),
      updated_at = NOW()
    WHERE nurture_status = 'ACTIVE'
      AND last_interaction_at < NOW() - INTERVAL '14 days'
      AND last_interaction_at >= NOW() - INTERVAL '30 days'
  `)

  // -5 pour ceux inactifs depuis 30 jours
  await pool.query(`
    UPDATE nurture_prospects SET
      engagement_score_current = GREATEST(0, engagement_score_current - 5),
      updated_at = NOW()
    WHERE nurture_status = 'ACTIVE'
      AND last_interaction_at < NOW() - INTERVAL '30 days'
      AND last_interaction_at >= NOW() - INTERVAL '60 days'
  `)

  // -10 pour ceux inactifs depuis 60 jours
  await pool.query(`
    UPDATE nurture_prospects SET
      engagement_score_current = GREATEST(0, engagement_score_current - 10),
      updated_at = NOW()
    WHERE nurture_status = 'ACTIVE'
      AND last_interaction_at < NOW() - INTERVAL '60 days'
      AND last_interaction_at >= NOW() - INTERVAL '90 days'
  `)

  // -20 pour ceux inactifs depuis 90 jours
  await pool.query(`
    UPDATE nurture_prospects SET
      engagement_score_current = GREATEST(0, engagement_score_current - 20),
      updated_at = NOW()
    WHERE nurture_status = 'ACTIVE'
      AND last_interaction_at < NOW() - INTERVAL '90 days'
  `)

  // Detecter ceux tombes a 0
  const zeroScores = await pool.query(`
    SELECT prospect_id
    FROM nurture_prospects
    WHERE nurture_status = 'ACTIVE'
      AND engagement_score_current = 0
      AND emails_nurture_sent >= 5
  `)

  for (const row of zeroScores.rows) {
    await startReEngagementWorkflow(row.prospect_id)
  }

  console.log(`[6] Decay applique, ${zeroScores.rows.length} prospects a re-engager`)
}
```

---

## 10. OUTPUT : DONNEES PRODUITES PAR LE NURTUREUR

### 10.1 Donnees produites

Le Nurtureur produit 3 types de donnees qui alimentent les autres agents du pipeline.

#### 10.1.1 Prospects reclassifies → Agent 3 (SCOREUR)

Quand un prospect atteint le seuil HOT (engagement score >= 75 ou combinaison engagement + signal business), il est renvoye au Scoreur pour re-routing dans le pipeline actif.

```typescript
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
    resubmitted_at: string        // ISO 8601
    nurtureur_version: string
  }
}

// Dispatch vers Agent 3 via BullMQ
async function resubmitToScoreur(data: ScoreurResubmission): Promise<void> {
  const scoreurQueue = new Queue('scoreur-pipeline', {
    connection: { host: 'localhost', port: 6379 }
  })

  await scoreurQueue.add(
    `rescore-from-nurture-${data.prospect_id}`,
    data,
    {
      priority: 2,  // Haute priorite car prospect HOT
      delay: 0
    }
  )
}
```

#### 10.1.2 Interactions loggees → Agent 7 (ANALYSTE)

Toutes les interactions de nurturing sont loggees et accessibles par l'Agent 7 pour les rapports.

```typescript
interface NurtureAnalysteMetrics {
  // Metriques d'activite nurture
  activite: {
    periode: string
    date: string
    emails_nurture_envoyes: number
    emails_ouverts: number
    emails_cliques: number
    contenus_telecharges: number
    linkedin_likes: number
    linkedin_comments: number
    reponses_recues: number
    rescores_effectues: number
    total_interactions: number
  }

  // Metriques de conversion nurture
  conversion: {
    total_en_nurture: number
    reclassifies_hot: number
    taux_reclassification: number        // %
    delai_moyen_maturation_jours: number
    par_segment: Record<string, {
      en_nurture: number
      reclassifies: number
      taux: number
      delai_moyen: number
    }>
    par_handoff_reason: Record<string, {
      total: number
      reclassifies: number
      taux: number
    }>
  }

  // Metriques d'engagement
  engagement: {
    score_moyen: number
    distribution_scores: {
      zero: number             // Score = 0
      low: number              // 1-14
      medium: number           // 15-39
      warm: number             // 40-74
      hot: number              // 75+
    }
    par_parcours_etape: Record<string, {
      count: number
      score_moyen: number
    }>
  }

  // Metriques de sante
  sante: {
    taux_ouverture: number
    taux_clic: number
    taux_opt_out: number
    taux_sunset: number
    taux_re_engagement: number
    prospects_inactifs: number
  }

  // Metriques contenu
  contenu: {
    par_piece: Array<{
      content_id: string
      title: string
      format: string
      envoyes: number
      ouverts: number
      cliques: number
      taux_ouverture: number
      taux_clic: number
    }>
  }

  // Couts nurture
  couts: {
    claude_api_personnalisation_eur: number
    infrastructure_eur: number
    total_eur: number
    cout_par_lead_reclassifie_eur: number
  }
}

// Vue SQL pour l'Agent 7
const ANALYSTE_NURTURE_VIEWS_SQL = `
-- Vue metriques nurture quotidiennes
CREATE OR REPLACE VIEW v_nurture_metrics_daily AS
SELECT
  DATE(ni.created_at) as date,
  ni.interaction_type,
  ni.canal,
  np.segment,
  COUNT(*) as total,
  COUNT(DISTINCT ni.prospect_id) as prospects_uniques,
  SUM(ni.score_delta) as total_score_delta
FROM nurture_interactions ni
JOIN nurture_prospects np ON np.prospect_id = ni.prospect_id
GROUP BY DATE(ni.created_at), ni.interaction_type, ni.canal, np.segment;

-- Vue taux de conversion nurture par segment
CREATE OR REPLACE VIEW v_nurture_conversion_par_segment AS
SELECT
  np.segment,
  np.handoff_reason,
  COUNT(*) as total_en_nurture,
  COUNT(*) FILTER (WHERE np.nurture_status = 'RECLASSIFIED_HOT') as reclassifies_hot,
  ROUND(
    COUNT(*) FILTER (WHERE np.nurture_status = 'RECLASSIFIED_HOT')::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as taux_conversion_pct,
  AVG(CASE WHEN np.nurture_status = 'RECLASSIFIED_HOT'
    THEN EXTRACT(EPOCH FROM (np.updated_at - np.created_at)) / 86400
    ELSE NULL END
  ) as delai_moyen_maturation_jours
FROM nurture_prospects np
GROUP BY np.segment, np.handoff_reason;

-- Vue performance contenu nurture
CREATE OR REPLACE VIEW v_nurture_content_perf AS
SELECT
  ne.content_piece_id,
  ne.parcours_etape,
  np.segment,
  COUNT(*) as envoyes,
  COUNT(*) FILTER (WHERE ne.status IN ('OPENED', 'CLICKED', 'REPLIED')) as ouverts,
  COUNT(*) FILTER (WHERE ne.status IN ('CLICKED', 'REPLIED')) as cliques,
  ROUND(
    COUNT(*) FILTER (WHERE ne.status IN ('OPENED', 'CLICKED', 'REPLIED'))::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as taux_ouverture_pct,
  ROUND(
    COUNT(*) FILTER (WHERE ne.status IN ('CLICKED', 'REPLIED'))::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as taux_clic_pct
FROM nurture_emails ne
JOIN nurture_prospects np ON np.prospect_id = ne.prospect_id
GROUP BY ne.content_piece_id, ne.parcours_etape, np.segment
ORDER BY taux_clic_pct DESC;

-- Vue sante globale nurture
CREATE OR REPLACE VIEW v_nurture_sante AS
SELECT
  DATE_TRUNC('month', np.created_at) as mois,
  COUNT(*) as total_entres,
  COUNT(*) FILTER (WHERE np.nurture_status = 'ACTIVE') as actifs,
  COUNT(*) FILTER (WHERE np.nurture_status = 'RECLASSIFIED_HOT') as reclassifies,
  COUNT(*) FILTER (WHERE np.nurture_status = 'SUNSET') as sunsets,
  COUNT(*) FILTER (WHERE np.nurture_status = 'OPTED_OUT') as opt_outs,
  AVG(np.engagement_score_current) as score_moyen,
  AVG(np.emails_nurture_sent) as emails_moyen_par_prospect
FROM nurture_prospects np
GROUP BY DATE_TRUNC('month', np.created_at)
ORDER BY mois DESC;
`
```

#### 10.1.3 Opt-outs → Suppression RGPD

```typescript
interface OptOutRecord {
  prospect_id: string
  source: 'unsubscribe_link' | 're_permission_no' | 'email_reply_optout' | 'manual'
  timestamp: string
  rgpd_deletion_scheduled_at: string   // +30 jours
  data_to_delete: string[]              // ['nurture_interactions', 'nurture_emails', 'nurture_prospects']
}

// Emission vers l'Agent 7 et le systeme RGPD
async function emitOptOut(record: OptOutRecord): Promise<void> {
  // 1. Logger pour l'Agent 7
  await emitNurtureMetric({
    event: 'OPT_OUT',
    prospect_id: record.prospect_id,
    source: record.source,
    timestamp: record.timestamp
  })

  // 2. Planifier la suppression RGPD
  await pool.query(`
    INSERT INTO rgpd_deletion_queue (prospect_id, scheduled_at, source, status)
    VALUES ($1, $2, $3, 'PENDING')
  `, [record.prospect_id, record.rgpd_deletion_scheduled_at, record.source])
}
```

---

## 11. COUTS

### 11.1 Detail des couts mensuels

| Poste | Cout mensuel | Details |
|---|---|---|
| **Gmail API** (envoi nurture) | 0 EUR | Gratuit (quotas suffisants pour nurture) |
| **Domaine dedié nurture** (insights.axiom-marketing.fr) | ~1 EUR | ~12 EUR/an |
| **Claude API** (personnalisation emails) | ~8 EUR | ~1500 personnalisations/mois |
| **Claude API** (generation commentaires LinkedIn) | ~3 EUR | ~200 commentaires/mois |
| **Waalaxy Pro** (LinkedIn engagement) | 0 EUR | Deja inclus dans l'abonnement Agent 5 |
| **BuiltWith API** (re-scoring tech) | ~15 EUR | Re-scan mensuel ~100 prospects |
| **Google Custom Search** (news) | ~5 EUR | 100 requetes/jour gratuit, surplus ~5 EUR |
| **Redis** (BullMQ) | 0 EUR | Partage avec Agent 5 |
| **Infrastructure serveur** (workers) | ~5 EUR | Partage avec Agent 5 |
| **TOTAL** | **~37 EUR/mois** | |

### 11.2 Cout par personnalisation Claude API

```
Modele : claude-sonnet-4-20250514
Tarif : $3.00 / million tokens input, $15.00 / million tokens output

Par personnalisation email nurture :
- System prompt : ~600 tokens input
- User message (contexte prospect + template) : ~500 tokens input
- Total input : ~1100 tokens
- Output (email personnalise JSON) : ~250 tokens

Cout unitaire :
- Input : (1100 / 1M) x $3.00 = $0.0033
- Output : (250 / 1M) x $15.00 = $0.00375
- Total : $0.0071 par personnalisation ~ 0.0065 EUR

Volume estime : 1500 emails/mois (200 prospects x ~7 emails/mois)
Cout mensuel : 1500 x 0.0065 = 9.75 EUR ~ 8 EUR (avec cache)

Par commentaire LinkedIn :
- Input : ~300 tokens (post + consigne)
- Output : ~50 tokens
- Cout : ~$0.002 ~ 0.002 EUR
- Volume : ~200 commentaires/mois
- Cout mensuel : 200 x 0.002 = 0.40 EUR ~ 1 EUR (avec marge)
```

### 11.3 Cout par prospect (cycle nurture complet)

```
SCENARIO : 1 prospect traverse un cycle complet de nurture (3 mois, 12 emails)

Couts directs :
- Envoi emails (Gmail API) : 0 EUR
- Personnalisation Claude (12 emails) : 12 x 0.0065 = 0.08 EUR
- LinkedIn engagement (3 mois x ~10 interactions) : 10 x 0.002 = 0.02 EUR (comments)
- Re-scoring mensuel (3 rescores) : ~0.05 EUR (APIs externes)
- Infrastructure (au prorata) : ~0.02 EUR

Cout par prospect (cycle complet) : ~0.17 EUR

Pour 200 prospects en nurture : ~34 EUR de couts directs/mois
Cout par lead reclassifie HOT (si taux 5%) : 34 / 10 = 3.40 EUR
```

---

## 12. VERIFICATION DE COHERENCE

### 12.1 Input == Output Agent 5 (NurturerHandoff)

Verification que chaque champ de l'input du Nurtureur (Agent 6) correspond exactement a un champ de l'output de l'Agent 5 (section 10.2 NurturerHandoff).

| Champ input Agent 6 | Present dans output Agent 5 (NurturerHandoff) | Statut |
|---|---|---|
| `prospect_id` | `NurturerHandoff.prospect_id` | VALIDE |
| `lead_id` | `NurturerHandoff.lead_id` | VALIDE |
| `handoff_reason` | `NurturerHandoff.handoff_reason` | VALIDE |
| `sequence_summary.sequence_id` | `NurturerHandoff.sequence_summary.sequence_id` | VALIDE |
| `sequence_summary.steps_completed` | `NurturerHandoff.sequence_summary.steps_completed` | VALIDE |
| `sequence_summary.total_steps` | `NurturerHandoff.sequence_summary.total_steps` | VALIDE |
| `sequence_summary.emails_sent` | `NurturerHandoff.sequence_summary.emails_sent` | VALIDE |
| `sequence_summary.linkedin_actions` | `NurturerHandoff.sequence_summary.linkedin_actions` | VALIDE |
| `sequence_summary.duration_days` | `NurturerHandoff.sequence_summary.duration_days` | VALIDE |
| `sequence_summary.replies` | `NurturerHandoff.sequence_summary.replies` | VALIDE |
| `nurturing_recommendations.resume_date` | `NurturerHandoff.nurturing_recommendations.resume_date` | VALIDE |
| `nurturing_recommendations.suggested_content_type` | `NurturerHandoff.nurturing_recommendations.suggested_content_type` | VALIDE |
| `nurturing_recommendations.last_signal` | `NurturerHandoff.nurturing_recommendations.last_signal` | VALIDE |
| `nurturing_recommendations.engagement_score` | `NurturerHandoff.nurturing_recommendations.engagement_score` | VALIDE |
| `prospect.prenom` | `NurturerHandoff.prospect.prenom` | VALIDE |
| `prospect.nom` | `NurturerHandoff.prospect.nom` | VALIDE |
| `prospect.email` | `NurturerHandoff.prospect.email` | VALIDE |
| `prospect.entreprise_nom` | `NurturerHandoff.prospect.entreprise_nom` | VALIDE |
| `prospect.poste` | `NurturerHandoff.prospect.poste` | VALIDE |
| `prospect.segment` | `NurturerHandoff.prospect.segment` | VALIDE |
| `prospect.scoring_categorie` | `NurturerHandoff.prospect.scoring_categorie` | VALIDE |
| `metadata.agent` | `NurturerHandoff.metadata.agent` | VALIDE |
| `metadata.handoff_at` | `NurturerHandoff.metadata.handoff_at` | VALIDE |
| `metadata.suiveur_version` | `NurturerHandoff.metadata.suiveur_version` | VALIDE |

**RESULTAT : 100% de coherence input Agent 6 / output Agent 5 (NurturerHandoff).**

### 12.2 Outputs vers Agent 3 (SCOREUR)

| Donnee produite par Agent 6 | Necessaire pour Agent 3 | Raison |
|---|---|---|
| `ScoreurResubmission.prospect_id` | OUI | Identifier le prospect pour re-scoring |
| `ScoreurResubmission.lead_id` | OUI | Tracer le lead original |
| `ScoreurResubmission.source` | OUI | Savoir que ca vient du nurture (pas du pipeline normal) |
| `ScoreurResubmission.resubmission_reason` | OUI | Adapter le re-routing |
| `ScoreurResubmission.nurture_data.engagement_score` | OUI | Integrer dans le score global |
| `ScoreurResubmission.nurture_data.combined_score` | OUI | Score pre-calcule |
| `ScoreurResubmission.nurture_data.business_signals` | OUI | Nouveaux signaux detectes |
| `ScoreurResubmission.nurture_data.parcours_etape` | OUI | Adapter la sequence de re-prospection |
| `ScoreurResubmission.prospect.*` | OUI | Donnees prospect a jour |

**RESULTAT : L'output Agent 6 contient tous les champs necessaires pour l'Agent 3.**

### 12.3 Outputs vers Agent 7 (ANALYSTE)

| Donnee produite par Agent 6 | Necessaire pour Agent 7 | Raison |
|---|---|---|
| `NurtureAnalysteMetrics.activite` | OUI | KPIs d'activite nurture |
| `NurtureAnalysteMetrics.conversion` | OUI | Taux de reclassification |
| `NurtureAnalysteMetrics.engagement` | OUI | Distribution des scores |
| `NurtureAnalysteMetrics.sante` | OUI | Sante du nurturing |
| `NurtureAnalysteMetrics.contenu` | OUI | Performance par contenu |
| `NurtureAnalysteMetrics.couts` | OUI | Budget nurturing |
| Vues SQL (`v_nurture_*`) | OUI | Requetes directes pour rapports |

**RESULTAT : L'output Agent 6 contient tous les champs necessaires pour l'Agent 7.**

### 12.4 Pas de conflit Agent 5 / Agent 6

| Aspect | Agent 5 (SUIVEUR) | Agent 6 (NURTUREUR) | Conflit ? |
|---|---|---|---|
| **Quand** | Sequence initiale (2-4 semaines) | APRES la sequence initiale | NON - sequentiel |
| **Handoff** | Agent 5 envoie `NurturerHandoff` quand sequence terminee | Agent 6 consomme le `NurturerHandoff` | NON - clair |
| **Email** | Messages de prospection (commerciaux) | Contenu de valeur (educatif) | NON - types differents |
| **LinkedIn** | Connexion + messages directs | Likes/comments passifs | NON - actions differentes |
| **Domaine email** | axiom-marketing.fr, axiom-studio.fr | insights.axiom-marketing.fr | NON - domaines separes |
| **Frequence** | 4-6 emails en 3 semaines | 1-2 emails/semaine max | NON - rythmes differents |
| **Scoring** | Ne modifie pas le score (le constate) | Maintient et met a jour le score | NON - complementaire |
| **Retour pipeline** | Envoie au nurture OU notification Jonathan | Renvoie au Scoreur (Agent 3) si HOT | NON - directions differentes |

**RESULTAT : Aucun conflit entre Agent 5 et Agent 6. Les responsabilites sont clairement separees.**

### 12.5 Coherence du flux complet

```
Agent 5 outputs (fin de sequence) :
    |
    +---> NurturerHandoff (quand sequence terminee/pausee)
    |     --> Via BullMQ queue 'nurturer-pipeline'
    |     --> Consomme par Agent 6
    |
    v
AGENT 6 (NURTUREUR) :
    |
    +---> Sous-agent 6a : Email Nurture
    |     - Sequences comportementales par segment
    |     - Contenu awareness → consideration → decision
    |     - Tracking ouverture/clic
    |     - Ratio 3:1 valeur:promo
    |
    +---> Sous-agent 6b : LinkedIn Passif
    |     - Likes/comments sur posts prospects
    |     - Via Waalaxy (existant)
    |     - Max 3x/semaine par prospect
    |
    +---> Sous-agent 6c : Re-Scoreur Periodique
    |     - Scan signaux business (mensuel)
    |     - Triggers immediats (visite pricing, reponse)
    |     - Reclassification COLD → WARM → HOT
    |
    v
Agent 6 outputs :
    |
    +---> ScoreurResubmission (prospects HOT)
    |     --> Via BullMQ queue 'scoreur-pipeline'
    |     --> Consomme par Agent 3 (SCOREUR)
    |     --> Le prospect re-entre dans le pipeline actif
    |
    +---> NurtureAnalysteMetrics (metriques nurturing)
    |     --> Via vues SQL materialisees
    |     --> Consomme par Agent 7 (ANALYSTE)
    |
    +---> OptOutRecord (desinscriptions)
    |     --> Suppression RGPD planifiee
    |     --> Blacklist anti-recontact
    |
    +---> NurtureDashboard (rapport mensuel)
          --> Via vue SQL + generation automatique
          --> Pour Jonathan
```

### 12.6 Tables SQL de l'Agent 6

```sql
-- Recap des tables creees par l'Agent 6

-- 1. nurture_prospects : table principale des prospects en nurturing
--    Champs : prospect_id, lead_id, handoff_reason, nurture_status, engagement_score, segment, etc.
--    Index : nurture_status, next_email_scheduled_at, next_rescore_at, inactive_since, segment

-- 2. nurture_interactions : log de toutes les interactions
--    Champs : prospect_id, interaction_type, canal, details, score_delta, score_after
--    Index : prospect_id, interaction_type, created_at

-- 3. nurture_emails : emails nurture envoyes avec tracking
--    Champs : prospect_id, email_id, sequence_type, step_number, status, opened_at, clicked_at
--    Index : prospect_id, status

-- Vues pour l'Agent 7 :
-- v_nurture_dashboard_monthly : synthese mensuelle
-- v_nurture_content_performance : performance par contenu
-- v_nurture_funnel : entonnoir nurture
-- v_nurture_engagement_weekly : engagement par semaine
-- v_nurture_metrics_daily : metriques quotidiennes
-- v_nurture_conversion_par_segment : taux de conversion par segment
-- v_nurture_content_perf : performance detaillee contenu
-- v_nurture_sante : indicateurs de sante globale

-- Table RGPD
CREATE TABLE IF NOT EXISTS rgpd_deletion_queue (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rgpd_deletion_scheduled ON rgpd_deletion_queue(scheduled_at)
  WHERE status = 'PENDING';
```

---

## 13. INTEGRATION AVEC LES AGENTS 8, 9, 10

> **Ajout v1.1 -- 19 mars 2026** : Cette section documente l'integration du Nurtureur avec les trois nouveaux agents du pipeline etendu (Agent 8 Dealmaker, Agent 9 Appels d'offres, Agent 10 CSM).

### 13.1 Synthese de l'impact

| Agent | Impact sur Agent 6 | Nature |
|-------|-------------------|--------|
| **Agent 8 (Dealmaker)** | SIGNIFICATIF | L'Agent 8 envoie les deals PERDUS vers le Nurtureur pour re-engagement long terme. Nouveau type de handoff entrant a gerer. |
| **Agent 9 (Appels d'offres)** | AUCUN | L'Agent 9 gere un flux independant (marches publics). Les AO perdus ne sont pas renvoyes en nurture -- ils sont archives par l'Agent 9. |
| **Agent 10 (CSM)** | MODERE | L'Agent 10 envoie les clients CHURNES (resilies ou desabonnes) vers le Nurtureur pour une campagne de re-engagement/win-back. Nouveau type de handoff entrant. |

### 13.2 Nouveau handoff entrant : Deals PERDUS de l'Agent 8

#### 13.2.1 Contexte

Quand un deal est perdu (prospect a decline la proposition, a choisi un concurrent, ou ne donne plus de nouvelles apres le RDV decouverte), l'Agent 8 transmet le prospect au Nurtureur pour un re-engagement long terme. L'objectif est de maintenir la relation et de re-activer le prospect quand les conditions changent.

#### 13.2.2 Nouveau type de handoff

Le `handoff_reason` de l'Agent 6 doit etre etendu pour accepter les nouveaux types :

```typescript
// AVANT (v1.0)
handoff_reason: 'SEQUENCE_COMPLETED_NO_REPLY' | 'PAS_MAINTENANT' | 'INTERESTED_SOFT_NO_FOLLOWUP'

// APRES (v1.1)
handoff_reason:
  | 'SEQUENCE_COMPLETED_NO_REPLY'       // Existant (Agent 5)
  | 'PAS_MAINTENANT'                     // Existant (Agent 5)
  | 'INTERESTED_SOFT_NO_FOLLOWUP'        // Existant (Agent 5)
  | 'DEAL_LOST'                          // NOUVEAU (Agent 8 -- deal perdu)
  | 'CLIENT_CHURNED'                     // NOUVEAU (Agent 10 -- client resilie)
```

#### 13.2.3 Schema du handoff depuis l'Agent 8

```typescript
interface DealLostHandoff {
  prospect_id: string
  lead_id: string

  handoff_reason: 'DEAL_LOST'

  // Contexte du deal perdu
  deal_context: {
    deal_id: string
    deal_stage_reached: string           // Etape maximale atteinte dans le pipeline
    deal_value: number                   // Montant estime du deal
    loss_reason: string                  // Raison de la perte (prix, concurrent, timing, interne)
    competitor_name: string | null       // Concurrent choisi (si applicable)
    decision_maker: string               // Poste du decideur
    last_interaction_date: string        // Derniere interaction avant perte
    total_interactions: number           // Nombre d'interactions pendant le deal
  }

  // Recommandations pour le nurturing
  nurturing_recommendations: {
    resume_date: string                  // Date suggeree pour reprendre contact
    suggested_approach: 'value_content' | 'case_study' | 'new_offer' | 'check_in'
    cooling_period_days: number          // Periode de refroidissement avant contact (30-90j)
    notes_jonathan: string | null        // Notes de Jonathan sur ce prospect
  }

  // Donnees prospect
  prospect: {
    prenom: string
    nom: string
    email: string
    entreprise_nom: string
    poste: string
    segment: string
    score_total: number
  }

  metadata: {
    agent: 'agent_8_dealmaker'
    handoff_at: string
    dealmaker_version: string
  }
}
```

#### 13.2.4 Routage des deals perdus

```typescript
// Dans le routeur initial du Nurtureur, ajouter :
function routeNewProspect(input: NurturerInput): NurtureConfig {
  switch (input.handoff_reason) {
    // ... cas existants (SEQUENCE_COMPLETED_NO_REPLY, PAS_MAINTENANT, etc.)

    case 'DEAL_LOST':
      return {
        sequence_type: 'WIN_BACK_DEAL',     // Nouvelle sequence dediee
        cooling_period_days: input.deal_context?.cooling_period_days || 60,
        content_strategy: 'value_first',      // Apporter de la valeur avant de re-pitcher
        frequency: 'monthly',                 // 1 email/mois max (respecter l'espace)
        max_duration_months: 12,              // Nurture pendant 12 mois max
        engagement_threshold_hot: 80,         // Seuil de re-routing vers Agent 3
      }

    case 'CLIENT_CHURNED':
      return {
        sequence_type: 'WIN_BACK_CLIENT',    // Sequence win-back client
        cooling_period_days: input.churn_context?.cooling_period_days || 30,
        content_strategy: 'new_features',     // Mettre en avant les nouveautes
        frequency: 'biweekly',               // 2 emails/mois (relation pre-existante)
        max_duration_months: 6,               // Nurture pendant 6 mois max
        engagement_threshold_hot: 70,         // Seuil plus bas car deja client
      }
  }
}
```

### 13.3 Nouveau handoff entrant : Clients CHURNES de l'Agent 10

#### 13.3.1 Contexte

Quand un client resilie son contrat ou montre des signes de churn avance que l'Agent 10 n'a pas pu empecher, le client est transmis au Nurtureur pour une campagne de win-back. L'objectif est de re-engager l'ancien client avec du contenu pertinent (nouvelles fonctionnalites, nouvelles offres, case studies).

#### 13.3.2 Schema du handoff depuis l'Agent 10

```typescript
interface ClientChurnedHandoff {
  prospect_id: string
  lead_id: string
  client_id: string

  handoff_reason: 'CLIENT_CHURNED'

  // Contexte du churn
  churn_context: {
    churn_date: string                   // Date de resiliation
    churn_reason: string                 // Raison (prix, insatisfaction, concurrent, interne)
    contract_duration_months: number     // Duree du contrat avant churn
    total_revenue: number                // CA total genere par ce client
    last_nps_score: number | null        // Dernier score NPS
    services_used: string[]              // Services utilises
    cooling_period_days: number          // Periode de refroidissement (30j min)
  }

  // Recommandations de l'Agent 10
  nurturing_recommendations: {
    resume_date: string
    suggested_approach: 'new_features' | 'special_offer' | 'case_study' | 'personal_outreach'
    pain_points_unresolved: string[]     // Points de douleur non resolus
  }

  // Donnees contact
  prospect: {
    prenom: string
    nom: string
    email: string
    entreprise_nom: string
    poste: string
    segment: string
  }

  metadata: {
    agent: 'agent_10_csm'
    handoff_at: string
    csm_version: string
  }
}
```

### 13.4 Recapitulatif des handoffs entrants mis a jour

| Source | handoff_reason | Queue BullMQ | Sequence nurture | Statut |
|--------|---------------|-------------|-----------------|--------|
| Agent 5 (Suiveur) | `SEQUENCE_COMPLETED_NO_REPLY` | `nurturer-pipeline` | Standard par segment | EXISTANT |
| Agent 5 (Suiveur) | `PAS_MAINTENANT` | `nurturer-pipeline` | Standard avec resume_date | EXISTANT |
| Agent 5 (Suiveur) | `INTERESTED_SOFT_NO_FOLLOWUP` | `nurturer-pipeline` | Standard avec engagement eleve | EXISTANT |
| **Agent 8 (Dealmaker)** | **`DEAL_LOST`** | **`nurturer-pipeline`** | **WIN_BACK_DEAL (mensuel, 12 mois max)** | **NOUVEAU** |
| **Agent 10 (CSM)** | **`CLIENT_CHURNED`** | **`nurturer-pipeline`** | **WIN_BACK_CLIENT (bimensuel, 6 mois max)** | **NOUVEAU** |

### 13.5 Impact sur la validation d'input

Le schema Zod de validation (section 2.2) doit etre etendu :

```typescript
// Ajouter les nouveaux handoff_reason au schema
handoff_reason: z.enum([
  'SEQUENCE_COMPLETED_NO_REPLY',
  'PAS_MAINTENANT',
  'INTERESTED_SOFT_NO_FOLLOWUP',
  'DEAL_LOST',          // NOUVEAU
  'CLIENT_CHURNED',     // NOUVEAU
]),
```

Le schema de l'input doit egalement accepter les champs optionnels `deal_context` (pour DEAL_LOST) et `churn_context` (pour CLIENT_CHURNED).

### 13.6 Ce qui NE change PAS

| Composant | Changement |
|-----------|-----------|
| Sequences nurture existantes (par segment, 12 mois) | AUCUN -- les nouvelles sequences s'ajoutent en complement |
| Sous-agents existants (6a Content, 6b LinkedIn, 6c Re-scoring, 6d Email) | AUCUN |
| Engagement scoring (section 9) | AUCUN -- meme logique pour les deals perdus et clients churnes |
| Re-scoring periodique --> Agent 3 | AUCUN -- les deals perdus et clients churnes sont re-scores normalement |
| Sunset policy | AUCUN -- s'applique aussi aux nouvelles sequences |
| Conformite RGPD | AUCUN -- memes regles d'opt-out et retention |
| Output vers Agent 7 (metriques) | AUCUN -- les nouvelles sequences produisent les memes metriques |
| Cout (~37 EUR/mois) | IMPACT MINIMAL -- volume additionnel faible (5-15 deals perdus + 2-5 churns/mois) |

---

## ANNEXE A : FONCTIONS UTILITAIRES

```typescript
// Fonctions partagees par tous les sous-agents

function daysBetween(date1: Date, date2: Date): number {
  return Math.ceil(Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24))
}

function sixMonthsAgo(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().split('T')[0]
}

function calculateNextEmailDelay(prospect: NurtureProspectRecord, content: ContentPiece): number {
  // Base : 5 jours
  let delay = 5

  // Si prospect engage (score > 40), accelerer
  if (prospect.engagement_score_current > 40) delay = 3

  // Si prospect peu engage (score < 15), ralentir
  if (prospect.engagement_score_current < 15) delay = 10

  // Si contenu promo, attendre plus longtemps avant le prochain
  if (content.type === 'promo') delay += 2

  // Ne jamais depasser 14 jours entre emails
  return Math.min(delay, NURTURE_EMAIL_CONFIG.max_days_between_emails)
}

interface NurtureProspectRecord {
  prospect_id: string
  lead_id: string
  prenom: string
  nom: string
  email: string
  entreprise_nom: string
  poste: string
  segment: string
  scoring_categorie: string
  nurture_status: string
  current_sequence_type: string
  current_step: number
  engagement_score_current: number
  parcours_etape: string
  emails_nurture_sent: number
  emails_opened: number
  emails_clicked: number
  content_downloaded: number
  linkedin_interactions: number
  last_interaction_at: string | null
  last_email_sent_at: string | null
  inactive_since: string | null
  consent_status: string
  created_at: string
}

async function loadNurtureProspect(prospect_id: string): Promise<NurtureProspectRecord | null> {
  const result = await pool.query(`
    SELECT np.*, p.prenom, p.nom, p.email, p.entreprise_nom, p.poste
    FROM nurture_prospects np
    JOIN prospects p ON p.prospect_id = np.prospect_id
    WHERE np.prospect_id = $1
  `, [prospect_id])

  return result.rows[0] || null
}

async function logNurtureInteraction(data: {
  prospect_id: string
  interaction_type: string
  canal: string
  details: Record<string, unknown>
  score_delta: number
  score_after: number
}): Promise<void> {
  await pool.query(`
    INSERT INTO nurture_interactions (prospect_id, interaction_type, canal, details, score_delta, score_after)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [data.prospect_id, data.interaction_type, data.canal, JSON.stringify(data.details), data.score_delta, data.score_after])
}

async function emitNurtureMetric(metric: Record<string, unknown>): Promise<void> {
  // Emet une metrique pour l'Agent 7 via Pub/Sub
  // Implementation identique a l'Agent 5
  console.log('[6] Metric emitted:', JSON.stringify(metric))
}

async function sendSlackNotification(notification: {
  channel: string
  text: string
  priority: 'low' | 'normal' | 'high'
}): Promise<void> {
  // Implementation Slack identique a l'Agent 5
  console.log('[6] Slack notification:', notification.text)
}

function wrapLinksForTracking(body: string, email_id: string): string {
  // Remplace les URLs par des URLs trackees
  return body.replace(
    /(https?:\/\/[^\s\)]+)/g,
    (url) => `https://track.axiom-marketing.fr/click/${email_id}?url=${encodeURIComponent(url)}`
  )
}

function textToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}

function buildMimeMessage(params: {
  from: string
  to: string
  replyTo: string
  subject: string
  textBody: string
  htmlBody: string
  headers: Record<string, string>
}): string {
  const boundary = `boundary-${Date.now()}`
  const headerLines = Object.entries(params.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n')

  return [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Reply-To: ${params.replyTo}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    headerLines,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    params.textBody,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    params.htmlBody,
    '',
    `--${boundary}--`
  ].join('\r\n')
}

async function getGmailAuth(): Promise<any> {
  // Configuration OAuth2 pour Gmail API
  // Identique a l'Agent 5
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    scopes: ['https://www.googleapis.com/auth/gmail.send']
  })
  return auth
}
```

---

## ANNEXE B : CRON JOBS

| Job | Frequence | Description |
|---|---|---|
| `scanProspectPosts()` | Toutes les 12h (9h, 15h) | Scanner les posts LinkedIn des prospects |
| `triggerMonthlyRescore()` | 1er du mois, 6h | Re-scoring periodique de tous les prospects |
| `detectInactiveProspects()` | Chaque lundi, 8h | Detecter les prospects sans interaction depuis 60j |
| `applyEngagementDecay()` | Chaque dimanche, 3h | Appliquer la decroissance naturelle des scores |
| `processRGPDDeletions()` | Chaque jour, 2h | Supprimer les donnees expirees (RGPD) |
| `generateMonthlyReport()` | 1er du mois, 9h | Generer le rapport mensuel nurture |

```typescript
import cron from 'node-cron'

// Scanner les posts LinkedIn 2x/jour
cron.schedule('0 9,15 * * *', () => scanProspectPosts(), {
  timezone: 'Indian/Reunion'
})

// Re-scoring mensuel
cron.schedule('0 6 1 * *', () => triggerMonthlyRescore(), {
  timezone: 'Indian/Reunion'
})

// Detection inactifs (lundi 8h)
cron.schedule('0 8 * * 1', () => detectInactiveProspects(), {
  timezone: 'Indian/Reunion'
})

// Decay hebdomadaire (dimanche 3h)
cron.schedule('0 3 * * 0', () => applyEngagementDecay(), {
  timezone: 'Indian/Reunion'
})

// RGPD quotidien (2h)
cron.schedule('0 2 * * *', () => processRGPDDeletions(), {
  timezone: 'Indian/Reunion'
})

// Rapport mensuel (1er du mois 9h)
cron.schedule('0 9 1 * *', () => generateMonthlyReport(), {
  timezone: 'Indian/Reunion'
})
```

---

## ANNEXE C : VARIABLES D'ENVIRONNEMENT

```bash
# Gmail API (nurture)
GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/service-account.json

# Claude API (personnalisation)
ANTHROPIC_API_KEY=sk-ant-...

# Waalaxy (LinkedIn engagement)
WAALAXY_API_KEY=wlx_...

# BuiltWith (re-scoring tech)
BUILTWITH_API_KEY=bw_...

# Dealroom (re-scoring levees)
DEALROOM_API_KEY=dr_...

# Indeed (re-scoring recrutement)
INDEED_API_KEY=indeed_...

# Google Custom Search (re-scoring news)
GOOGLE_API_KEY=AIza...
GOOGLE_CSE_ID=cx_...

# Redis (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/axiom_prospection

# Slack (notifications)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_BOT_TOKEN=xoxb-...

# Tracking
TRACKING_BASE_URL=https://track.axiom-marketing.fr
UNSUBSCRIBE_URL=https://axiom-marketing.fr/unsubscribe
```

---

**FIN DES SPECIFICATIONS AGENT 6 — NURTUREUR v1.0**
