# SOUS-AGENT 6a — EMAIL NURTURE
**Agent parent** : AGENT-6-MASTER.md

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing

---

## 1. MISSION

Le sous-agent Email Nurture gere l'envoi de sequences email comportementales (NON drip statiques) aux prospects en nurturing. Chaque email est adapte a l'etape du parcours d'achat (awareness, consideration, decision) et au segment du prospect. Le ratio est 3:1 valeur:promo minimum.

## 2. PRINCIPES

- **Comportemental, pas drip** : Le chemin de chaque prospect depend de ses actions (ouvre, clique, repond) et non d'un calendrier fixe
- **3:1 valeur:promo** : Pour 3 emails de contenu (article, cas d'usage, insight), maximum 1 email mentionnant Axiom
- **Frequence controlee** : Maximum 2 emails/semaine, minimum 1 email/2 semaines
- **Personnalisation IA** : Chaque email est personnalise via Claude API en fonction du segment, du poste, et de l'historique d'engagement
- **Tracking ouverture et clics** : Pixel transparent 1x1 pour opens, liens trackes pour clics

## 3. PROCESSUS DETAILLE

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

## 4. CODE TYPESCRIPT COMPLET

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
```

## 5. METRIQUES SOUS-AGENT 6a

```typescript
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

**FIN DES SPECIFICATIONS SOUS-AGENT 6a — EMAIL NURTURE**
