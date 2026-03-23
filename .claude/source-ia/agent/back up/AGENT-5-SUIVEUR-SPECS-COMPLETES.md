# AGENT 5 -- SUIVEUR : SPECIFICATIONS TECHNIQUES COMPLETES

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B multicanal (Email + LinkedIn)
**Public :** Jonathan Dewaele, Marty Wong, equipe tech Univile

---

## TABLE DES MATIERES

1. [Mission](#1-mission)
2. [Input : Schema JSON recu de l'Agent 4](#2-input--schema-json-recu-de-lagent-4)
3. [Sous-Agents](#3-sous-agents)
4. [Sequences completes par segment](#4-sequences-completes-par-segment)
5. [Scheduling](#5-scheduling)
6. [Detection des reponses](#6-detection-des-reponses)
7. [Notifications](#7-notifications)
8. [Gestion des erreurs](#8-gestion-des-erreurs)
9. [Domain Warming Plan](#9-domain-warming-plan)
10. [Output : donnees produites](#10-output--donnees-produites)
11. [Couts](#11-couts)
12. [Verification de coherence](#12-verification-de-coherence)

---

## 1. MISSION

### 1.1 Definition

L'Agent 5 (SUIVEUR) est le **moteur d'execution** du pipeline de prospection Axiom Marketing. Il recoit les messages prets a envoyer de l'Agent 4 (REDACTEUR) et les **envoie au bon moment, sur le bon canal, au bon prospect**, puis **detecte et classifie les reponses**, **gere les sequences multicanales**, et **notifie Jonathan** des evenements importants.

### 1.2 Responsabilites exactes

| Responsabilite | Agent 5 fait | Autres agents font |
|---|---|---|
| **Envoi email** | Envoi via Gmail API/Mailgun, tracking, gestion bounces | Agent 4 redige le contenu |
| **Envoi LinkedIn** | Connexions + messages via Waalaxy, likes/comments auto | Agent 4 redige notes et messages |
| **Detection reponses** | Polling inbox, webhook Gmail, detection LinkedIn | Agent 6 prend le relais pour nurturing |
| **Classification IA** | Claude API pour classifier chaque reponse | -- |
| **Orchestration sequences** | Scheduler etapes, widening gap, arret si reponse | Agent 3 definit le scoring/priorite |
| **Notifications** | Slack interactif, SLA, escalade | Jonathan prend la decision finale |
| **Domain warming** | Warmup progressif, rotation domaines | -- |
| **Logging interactions** | Toutes les interactions sont loggees | Agent 7 les analyse |

### 1.3 Ce que le Suiveur ne fait PAS

- Ne redige aucun message (responsabilite Agent 4 REDACTEUR)
- Ne score pas les prospects (responsabilite Agent 3 SCOREUR)
- Ne fait pas de nurturing long terme (responsabilite Agent 6 NURTUREUR)
- Ne produit pas de rapports analytiques (responsabilite Agent 7 ANALYSTE)
- Ne prend pas de decisions commerciales (responsabilite de Jonathan)

### 1.4 Position dans le pipeline

```
Agent 1 (VEILLEUR) --> Agent 2 (ENRICHISSEUR) --> Agent 3 (SCOREUR)
                                                       |
                                                       v
                                              Agent 4 (REDACTEUR)
                                                       |
                                                       v
                                           ===========================
                                           |  AGENT 5 (SUIVEUR)      |
                                           |  - Envoie messages      |
                                           |  - Detecte reponses     |
                                           |  - Gere sequences       |
                                           |  - Notifie Jonathan     |
                                           ===========================
                                                       |
                                              +--------+--------+
                                              |                 |
                                              v                 v
                                     Agent 6 (NURTUREUR)  Agent 7 (ANALYSTE)
```

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 4

### 2.1 Schema JSON complet (output Agent 4 = input Agent 5)

Le Suiveur recoit cet objet via la queue BullMQ `suiveur-pipeline`. Chaque job contient un objet `RedacteurOutput` complet.

```typescript
interface SuiveurInput {
  // === Identifiants ===
  message_id: string           // UUID v4 unique du message
  prospect_id: string          // UUID v4 du prospect
  lead_id: string              // UUID v4 du lead original (venant de l'Agent 1)
  generated_at: string         // ISO 8601 timestamp de generation

  // === Message pret a envoyer ===
  message: {
    canal: 'email' | 'linkedin_connection' | 'linkedin_message' | 'linkedin_inmail'
    type: string               // ex: 'email_froid', 'follow_up_1', etc.
    subject_line: string | null // null pour LinkedIn
    body: string               // Corps du message (plain text)
    cta: string                // Call-to-action
    signature: string          // Signature email
    format: 'plain_text'       // Toujours plain text
    word_count: number
    language: 'fr' | 'en'
  }

  // === Message LinkedIn (si applicable) ===
  linkedin_message: {
    connection_note: {
      content: string          // Max 300 caracteres
      character_count: number
    }
    post_connection_message: {
      content: string          // Message apres acceptation connexion
      character_count: number
    }
  } | null

  // === Donnees prospect ===
  prospect: {
    prenom: string
    nom: string
    email: string
    email_verified: boolean
    linkedin_url: string | null
    poste: string
    entreprise_nom: string
  }

  // === Instructions de sequence ===
  sequence: {
    sequence_id: string        // ex: 'SEQ_HOT_B_PRIORITY'
    etape_actuelle: number     // 1, 2, 3, 4...
    etape_total: number
    etape_type: string         // 'premier_contact', 'follow_up', 'breakup'
    prochaine_etape_dans_jours: number
    espacement_jours: number[] // ex: [0, 2, 5, 10]
  }

  // === Reference template ===
  template: {
    template_id: string
    template_version: string
    template_status: 'control' | 'challenger'
    ab_test_id: string | null
    ab_variant: 'A' | 'B' | null
  }

  // === Score et categorie ===
  scoring: {
    score_total: number        // 0-100
    categorie: 'HOT' | 'WARM' | 'COLD'
    sous_categorie: string | null  // 'HOT_A', 'HOT_B', 'HOT_C', etc.
    segment: string            // 'pme_metro', 'startup_tech', etc.
    signal_principal: string
  }

  // === Validation Agent 4 ===
  validation: {
    statut: 'approved' | 'approved_with_edit'
    validated_by: 'jonathan' | 'auto'
    validated_at: string       // ISO 8601
    quality_checks: {
      longueur: 'PASS' | 'FAIL'
      spam_words: 'PASS' | 'FAIL'
      ton: 'PASS' | 'FAIL'
      hallucination: 'PASS' | 'FAIL'
      personnalisation: 'PASS' | 'FAIL'
    }
  }

  // === Instructions de routage ===
  routing: {
    canal_principal: string    // 'email_perso', 'email_generique', 'linkedin_dm'
    canal_secondaire: string | null
    urgence: 'haute' | 'moyenne' | 'basse'
    sla_heures: number         // Delai max avant envoi
    priorite_queue: number     // 1 = plus haute
    domaine_envoi_suggere: string  // 'axiom-marketing.fr', etc.
  }

  // === Donnees d'impact ===
  impact_data: {
    perte_ca_mensuelle: number
    perte_ca_annuelle: number
    taux_bounce_estime: number
    impact_conversion_pct: number
    message_impact: string
  }

  // === Metadata Agent 4 ===
  metadata: {
    agent: 'agent_4_redacteur'
    generation_model: string
    generation_temperature: number
    generation_cost_usd: number
    generation_latency_ms: number
    generation_attempts: number
    batch_id: string
    redacteur_version: string
  }
}
```

### 2.2 Reception via BullMQ Worker

```typescript
import { Worker, Job } from 'bullmq'

const suiveurWorker = new Worker(
  'suiveur-pipeline',
  async (job: Job<SuiveurInput>) => {
    const input = job.data

    // 1. Valider l'input
    const validation = validateSuiveurInput(input)
    if (!validation.valid) {
      console.error(`[Agent5] Input invalide: ${validation.errors.join(', ')}`)
      throw new Error(`INVALID_INPUT: ${validation.errors.join(', ')}`)
    }

    // 2. Verifier que le prospect n'est pas deja supprime/opt-out
    const prospectStatus = await getProspectStatus(input.prospect_id)
    if (['SUPPRESSED', 'OPTED_OUT', 'EXCLUDED'].includes(prospectStatus)) {
      console.warn(`[Agent5] Prospect ${input.prospect_id} est ${prospectStatus}, skip`)
      return { status: 'SKIPPED', reason: prospectStatus }
    }

    // 3. Verifier idempotence (pas de doublon)
    const alreadySent = await checkIdempotency(input.message_id)
    if (alreadySent) {
      console.warn(`[Agent5] Message ${input.message_id} deja envoye`)
      return { status: 'DUPLICATE', message_id: input.message_id }
    }

    // 4. Router vers le bon sous-agent
    return await routeToSubAgent(input)
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    concurrency: 5,
    limiter: {
      max: 10,       // Max 10 jobs par intervalle
      duration: 60000 // Par minute
    }
  }
)

async function routeToSubAgent(input: SuiveurInput): Promise<any> {
  const canal = input.message.canal

  switch (canal) {
    case 'email':
      return await SubAgent5a_EnvoyeurEmail.process(input)

    case 'linkedin_connection':
    case 'linkedin_message':
    case 'linkedin_inmail':
      return await SubAgent5b_EnvoyeurLinkedIn.process(input)

    default:
      throw new Error(`Canal inconnu: ${canal}`)
  }
}

function validateSuiveurInput(input: SuiveurInput): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!input.message_id) errors.push('message_id manquant')
  if (!input.prospect_id) errors.push('prospect_id manquant')
  if (!input.message?.body) errors.push('message.body manquant')
  if (!input.prospect?.email && input.message.canal === 'email') {
    errors.push('prospect.email manquant pour canal email')
  }
  if (!input.prospect?.linkedin_url && input.message.canal.startsWith('linkedin')) {
    errors.push('prospect.linkedin_url manquant pour canal LinkedIn')
  }
  if (!input.validation || input.validation.statut === 'rejected') {
    errors.push('message non approuve (statut rejected)')
  }
  if (!input.sequence?.sequence_id) errors.push('sequence_id manquant')
  if (!input.routing?.canal_principal) errors.push('routing.canal_principal manquant')

  return { valid: errors.length === 0, errors }
}
```

---

## 3. SOUS-AGENTS

### 3a. ENVOYEUR EMAIL

#### 3a.1 Architecture technique

```
SuiveurInput (canal=email)
    |
    v
+-----------------------------------+
| SOUS-AGENT 5a : ENVOYEUR EMAIL   |
| 1. Selectionner domaine d'envoi  |
| 2. Verifier throttling           |
| 3. Construire email MIME         |
| 4. Envoyer via Gmail API/Mailgun |
| 5. Logger Message-ID             |
| 6. Planifier prochaine etape     |
+-----------------------------------+
    |
    v
Email envoye --> Log en base
```

#### 3a.2 Envoi via Gmail API (canal principal)

```typescript
import { google, gmail_v1 } from 'googleapis'

interface EmailSendResult {
  success: boolean
  message_id_gmail: string       // Message-ID retourne par Gmail
  thread_id: string              // Thread ID pour tracking replies
  domaine_envoi: string
  sent_at: string
  idempotency_key: string
}

class SubAgent5a_EnvoyeurEmail {
  private oauth2Client: any
  private gmail: gmail_v1.Gmail

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000/oauth2callback'
    )
    this.oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    })
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
  }

  async process(input: SuiveurInput): Promise<EmailSendResult> {
    // 1. Selectionner le domaine d'envoi
    const domaine = await this.selectDomaine(input)

    // 2. Verifier le throttling
    const throttleOK = await this.checkThrottle(domaine)
    if (!throttleOK) {
      // Reporter l'envoi a la prochaine fenetre disponible
      const nextSlot = await this.getNextAvailableSlot(domaine)
      await this.reschedule(input, nextSlot)
      return { success: false, message_id_gmail: '', thread_id: '', domaine_envoi: domaine, sent_at: '', idempotency_key: '' }
    }

    // 3. Verifier que c'est un jour/heure ouvre (timezone prospect)
    const sendTimeOK = await this.checkBusinessHours(input)
    if (!sendTimeOK) {
      const nextBusinessSlot = await this.getNextBusinessSlot(input)
      await this.reschedule(input, nextBusinessSlot)
      return { success: false, message_id_gmail: '', thread_id: '', domaine_envoi: domaine, sent_at: '', idempotency_key: '' }
    }

    // 4. Construire l'email MIME
    const rawEmail = this.buildMimeEmail(input, domaine)

    // 5. Generer cle d'idempotence
    const idempotencyKey = `${input.message_id}_${input.sequence.etape_actuelle}`

    // 6. Verifier idempotence
    const alreadySent = await this.checkIdempotency(idempotencyKey)
    if (alreadySent) {
      return alreadySent
    }

    // 7. Envoyer
    try {
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawEmail,
        },
      })

      const result: EmailSendResult = {
        success: true,
        message_id_gmail: response.data.id!,
        thread_id: response.data.threadId!,
        domaine_envoi: domaine,
        sent_at: new Date().toISOString(),
        idempotency_key: idempotencyKey,
      }

      // 8. Logger en base
      await this.logSend(input, result)

      // 9. Incrementer compteur throttle
      await this.incrementThrottleCounter(domaine)

      // 10. Planifier prochaine etape si applicable
      await this.scheduleNextStep(input)

      return result
    } catch (error: any) {
      await this.handleSendError(input, error, domaine)
      throw error
    }
  }

  private buildMimeEmail(input: SuiveurInput, domaine: string): string {
    const fromAddress = `jonathan@${domaine}`
    const toAddress = input.prospect.email

    // Headers personnalises pour tracking des reponses
    const headers = [
      `From: Jonathan Dewaele <${fromAddress}>`,
      `To: ${input.prospect.prenom} ${input.prospect.nom} <${toAddress}>`,
      `Subject: ${input.message.subject_line}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `X-Axiom-Message-ID: ${input.message_id}`,
      `X-Axiom-Prospect-ID: ${input.prospect_id}`,
      `X-Axiom-Sequence-Step: ${input.sequence.etape_actuelle}`,
      `X-Axiom-Sequence-ID: ${input.sequence.sequence_id}`,
      `X-Axiom-Categorie: ${input.scoring.categorie}`,
      `X-Axiom-Idempotency: ${input.message_id}_${input.sequence.etape_actuelle}`,
    ]

    // Corps : message + signature
    const body = `${input.message.body}\n\n${input.message.signature}`

    const email = `${headers.join('\r\n')}\r\n\r\n${body}`

    // Encoder en base64url pour Gmail API
    return Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  private async selectDomaine(input: SuiveurInput): Promise<string> {
    const domaineSuggere = input.routing.domaine_envoi_suggere

    // Verifier la sante du domaine suggere
    const domaineHealth = await this.getDomaineHealth(domaineSuggere)

    if (domaineHealth.bounce_rate > 0.03 || domaineHealth.spam_rate > 0.003) {
      // Domaine en mauvaise sante, chercher alternative
      const alternatives = await this.getHealthyDomaines()
      if (alternatives.length === 0) {
        throw new Error('AUCUN_DOMAINE_SAIN: tous les domaines ont des problemes')
      }
      return alternatives[0].domaine
    }

    // Verifier le quota journalier restant
    const quotaRestant = await this.getDomaineQuotaRestant(domaineSuggere)
    if (quotaRestant <= 0) {
      const alternatives = await this.getDomainesAvecQuota()
      if (alternatives.length === 0) {
        // Reporter a demain
        return domaineSuggere // sera gere par le throttling
      }
      return alternatives[0].domaine
    }

    return domaineSuggere
  }

  private async checkThrottle(domaine: string): Promise<boolean> {
    const config = DOMAIN_THROTTLE_CONFIG[domaine]
    if (!config) return true

    const sentToday = await db.query(
      `SELECT COUNT(*) as count FROM email_sends
       WHERE domaine_envoi = $1
       AND sent_at >= CURRENT_DATE
       AND sent_at < CURRENT_DATE + INTERVAL '1 day'`,
      [domaine]
    )
    if (sentToday.rows[0].count >= config.maxPerDay) return false

    const sentThisHour = await db.query(
      `SELECT COUNT(*) as count FROM email_sends
       WHERE domaine_envoi = $1
       AND sent_at >= NOW() - INTERVAL '1 hour'`,
      [domaine]
    )
    if (sentThisHour.rows[0].count >= config.maxPerHour) return false

    return true
  }

  private async logSend(input: SuiveurInput, result: EmailSendResult): Promise<void> {
    await db.query(`
      INSERT INTO email_sends (
        message_id, prospect_id, lead_id, sequence_id,
        etape_numero, canal, domaine_envoi, gmail_message_id,
        gmail_thread_id, subject_line, body_preview,
        categorie, sous_categorie, segment,
        template_id, ab_test_id, ab_variant,
        idempotency_key, sent_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    `, [
      input.message_id, input.prospect_id, input.lead_id,
      input.sequence.sequence_id, input.sequence.etape_actuelle,
      'email', result.domaine_envoi, result.message_id_gmail,
      result.thread_id, input.message.subject_line,
      input.message.body.substring(0, 200),
      input.scoring.categorie, input.scoring.sous_categorie,
      input.scoring.segment,
      input.template.template_id, input.template.ab_test_id,
      input.template.ab_variant,
      result.idempotency_key, result.sent_at, 'SENT'
    ])
  }

  private async handleSendError(input: SuiveurInput, error: any, domaine: string): Promise<void> {
    const errorCode = error.code || error.status || 'UNKNOWN'

    // Hard bounce (550, 551, 552, 553)
    if ([550, 551, 552, 553].includes(errorCode)) {
      await this.handleHardBounce(input, error)
      return
    }

    // Soft bounce (450, 451, 452, 421)
    if ([450, 451, 452, 421].includes(errorCode)) {
      await this.handleSoftBounce(input, error)
      return
    }

    // Rate limited (429)
    if (errorCode === 429) {
      // Reporter d'1 heure
      await this.reschedule(input, Date.now() + 3600000)
      return
    }

    // Erreur generique : logger et retry via BullMQ
    await db.query(`
      INSERT INTO email_errors (
        message_id, prospect_id, error_code, error_message,
        domaine_envoi, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [input.message_id, input.prospect_id, errorCode, error.message, domaine])
  }

  private async handleHardBounce(input: SuiveurInput, error: any): Promise<void> {
    // Supprimer le prospect immediatement
    await db.query(
      `UPDATE prospects SET status = 'SUPPRESSED', suppressed_reason = 'HARD_BOUNCE',
       suppressed_at = NOW() WHERE prospect_id = $1`,
      [input.prospect_id]
    )

    // Annuler toutes les etapes planifiees
    await this.cancelAllPendingSteps(input.prospect_id)

    // Logger
    await db.query(`
      INSERT INTO bounce_events (
        prospect_id, message_id, bounce_type, error_code,
        error_message, email_address, created_at
      ) VALUES ($1, $2, 'HARD', $3, $4, $5, NOW())
    `, [input.prospect_id, input.message_id, error.code, error.message, input.prospect.email])
  }

  private async handleSoftBounce(input: SuiveurInput, error: any): Promise<void> {
    const bounceCount = await this.getSoftBounceCount(input.prospect_id)

    if (bounceCount >= 3) {
      // Trop de soft bounces, supprimer
      await this.handleHardBounce(input, error)
      return
    }

    // Retry avec backoff exponentiel : 1min, 10min, 1h
    const delays = [60000, 600000, 3600000]
    const delay = delays[Math.min(bounceCount, delays.length - 1)]

    await this.reschedule(input, Date.now() + delay)

    await db.query(`
      INSERT INTO bounce_events (
        prospect_id, message_id, bounce_type, error_code,
        error_message, retry_count, next_retry_at, created_at
      ) VALUES ($1, $2, 'SOFT', $3, $4, $5, $6, NOW())
    `, [
      input.prospect_id, input.message_id, error.code, error.message,
      bounceCount + 1, new Date(Date.now() + delay).toISOString()
    ])
  }

  private async scheduleNextStep(input: SuiveurInput): Promise<void> {
    const etapeActuelle = input.sequence.etape_actuelle
    const etapeTotal = input.sequence.etape_total

    if (etapeActuelle >= etapeTotal) {
      // Sequence terminee
      await db.query(
        `UPDATE prospect_sequences SET status = 'COMPLETED', completed_at = NOW()
         WHERE prospect_id = $1 AND sequence_id = $2`,
        [input.prospect_id, input.sequence.sequence_id]
      )
      return
    }

    // Calculer le delai pour la prochaine etape (widening gap)
    const espacements = input.sequence.espacement_jours
    const prochainEspacement = espacements[etapeActuelle] || espacements[espacements.length - 1]
    const delayMs = prochainEspacement * 24 * 60 * 60 * 1000

    // Ajouter un job pour la prochaine etape
    await suiveurQueue.add(
      `next-step-${input.prospect_id}-${etapeActuelle + 1}`,
      {
        prospect_id: input.prospect_id,
        sequence_id: input.sequence.sequence_id,
        etape_suivante: etapeActuelle + 1,
        type: 'SCHEDULE_NEXT_STEP',
      },
      {
        delay: delayMs,
        priority: input.routing.priorite_queue,
      }
    )
  }
}

// Configuration throttling par domaine
const DOMAIN_THROTTLE_CONFIG: Record<string, {
  maxPerDay: number
  maxPerHour: number
  delayBetweenSendsMs: number
  warmupComplete: boolean
}> = {
  'axiom-marketing.fr': {
    maxPerDay: 50,
    maxPerHour: 10,
    delayBetweenSendsMs: 360000, // 6 minutes entre chaque envoi
    warmupComplete: true,
  },
  'axiom-agency.com': {
    maxPerDay: 50,
    maxPerHour: 10,
    delayBetweenSendsMs: 360000,
    warmupComplete: false, // Warmup en cours
  },
  'axiom-growth.fr': {
    maxPerDay: 50,
    maxPerHour: 10,
    delayBetweenSendsMs: 360000,
    warmupComplete: false,
  },
}
```

#### 3a.3 Envoi via Mailgun (backup/haute delivrabilite)

```typescript
import Mailgun from 'mailgun.js'
import FormData from 'form-data'

class MailgunSender {
  private mg: any

  constructor() {
    const mailgun = new Mailgun(FormData)
    this.mg = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY!,
      url: 'https://api.eu.mailgun.net', // EU region pour RGPD
    })
  }

  async sendEmail(input: SuiveurInput, domaine: string): Promise<EmailSendResult> {
    const idempotencyKey = `${input.message_id}_${input.sequence.etape_actuelle}`

    const emailData = {
      from: `Jonathan Dewaele <jonathan@${domaine}>`,
      to: `${input.prospect.prenom} ${input.prospect.nom} <${input.prospect.email}>`,
      subject: input.message.subject_line,
      text: `${input.message.body}\n\n${input.message.signature}`,

      // Headers personnalises
      'h:X-Axiom-Message-ID': input.message_id,
      'h:X-Axiom-Prospect-ID': input.prospect_id,
      'h:X-Axiom-Sequence-Step': String(input.sequence.etape_actuelle),
      'h:X-Axiom-Idempotency': idempotencyKey,

      // Pas de tracking pixel (delivrabilite)
      'o:tracking': 'no',
      'o:tracking-clicks': 'no',
      'o:tracking-opens': 'no',

      // Mode test en dev
      'o:testmode': process.env.NODE_ENV === 'development' ? 'yes' : 'no',

      // DSN pour detecter bounces
      'o:require-tls': 'yes',
    }

    const response = await this.mg.messages.create(domaine, emailData)

    return {
      success: true,
      message_id_gmail: response.id,
      thread_id: response.id,
      domaine_envoi: domaine,
      sent_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
    }
  }
}
```

#### 3a.4 Tracking ouvertures et clics

**Regle Axiom : PAS de tracking pixel, PAS de tracking clics pour cold email.**

Raison : les pixels et redirections de liens degradent la delivrabilite de 15% et risquent un placement dans l'onglet Promotions de Gmail.

Le seul tracking est le **tracking des reponses** (replies) via Gmail API Watch ou IMAP polling.

Pour les follow-ups non froids (nurturing), le tracking peut etre active selecvement :

```typescript
// Uniquement pour emails nurturing (pas cold)
const TRACKING_POLICY = {
  cold_email: {
    track_opens: false,
    track_clicks: false,
    track_replies: true,   // Toujours
  },
  nurturing_email: {
    track_opens: true,     // Via Mailgun
    track_clicks: true,    // Via UTM params (pas de redirections)
    track_replies: true,
  },
}

// UTM tracking (non intrusif, pas de proxy)
function addUtmParams(url: string, input: SuiveurInput): string {
  const params = new URLSearchParams({
    utm_source: 'email',
    utm_medium: input.scoring.categorie.toLowerCase(),
    utm_campaign: input.sequence.sequence_id,
    utm_content: `step${input.sequence.etape_actuelle}`,
    utm_id: input.prospect_id,
  })
  return `${url}?${params.toString()}`
}
```

#### 3a.5 Gestion rotation domaines

```typescript
class DomainRotator {
  private domaines: string[]
  private currentIndex: number = 0

  constructor() {
    this.domaines = [
      'axiom-marketing.fr',
      'axiom-agency.com',
      'axiom-growth.fr',
    ]
  }

  async getNextDomaine(): Promise<string> {
    // Round-robin avec verification sante
    for (let i = 0; i < this.domaines.length; i++) {
      const idx = (this.currentIndex + i) % this.domaines.length
      const domaine = this.domaines[idx]

      const health = await this.checkHealth(domaine)
      const quota = await this.checkQuota(domaine)

      if (health.ok && quota.remaining > 0) {
        this.currentIndex = (idx + 1) % this.domaines.length
        return domaine
      }
    }

    throw new Error('TOUS_DOMAINES_EPUISES')
  }

  private async checkHealth(domaine: string): Promise<{ ok: boolean; bounceRate: number; spamRate: number }> {
    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'BOUNCED')::float / NULLIF(COUNT(*), 0) as bounce_rate,
        COUNT(*) FILTER (WHERE status = 'SPAM_COMPLAINT')::float / NULLIF(COUNT(*), 0) as spam_rate
      FROM email_sends
      WHERE domaine_envoi = $1
      AND sent_at >= NOW() - INTERVAL '7 days'
    `, [domaine])

    const bounceRate = stats.rows[0]?.bounce_rate || 0
    const spamRate = stats.rows[0]?.spam_rate || 0

    return {
      ok: bounceRate < 0.03 && spamRate < 0.003,
      bounceRate,
      spamRate,
    }
  }

  private async checkQuota(domaine: string): Promise<{ remaining: number }> {
    const config = DOMAIN_THROTTLE_CONFIG[domaine]
    const sentToday = await db.query(
      `SELECT COUNT(*) as count FROM email_sends
       WHERE domaine_envoi = $1 AND sent_at >= CURRENT_DATE`,
      [domaine]
    )
    return { remaining: config.maxPerDay - sentToday.rows[0].count }
  }
}
```

#### 3a.6 Volumes et limites

| Parametre | Valeur | Justification |
|---|---|---|
| Max emails/jour par adresse | 50 | Seuil safe Gmail Workspace |
| Max emails/jour par domaine | 50 | Proteger la reputation |
| Max emails/heure par domaine | 10 | Eviter les spikes |
| Delai minimum entre 2 envois | 6 minutes | Imiter un comportement humain |
| Total max/jour (3 domaines x 2 adresses) | 150 | 3 x 50 |
| Bounce rate max acceptable | 3% | Au-dela = pause domaine |
| Spam complaint rate max | 0.3% | Au-dela = pause + investigation |

#### 3a.7 Couts

| Poste | Cout mensuel | Notes |
|---|---|---|
| Gmail API | 0 EUR | Gratuit dans les quotas |
| Mailgun (plan Foundation) | 30 EUR/mois | 50K emails/mois inclus |
| Domaines supplementaires (x2) | 24 EUR/an total | ~12 EUR/domaine/an |
| Google Workspace (2 adresses) | 12 EUR/mois | 6 EUR/utilisateur/mois |

---

### 3b. ENVOYEUR LINKEDIN

#### 3b.1 Architecture technique

```
SuiveurInput (canal=linkedin_*)
    |
    v
+-------------------------------------------+
| SOUS-AGENT 5b : ENVOYEUR LINKEDIN        |
| 1. Verifier limites journalieres          |
| 2. Randomiser timing (120-300s delay)     |
| 3. Envoyer via Waalaxy API/webhook       |
| 4. Logger action                          |
| 5. Surveiller signes de restriction       |
+-------------------------------------------+
    |
    v
Action LinkedIn executee --> Log en base
```

#### 3b.2 Integration Waalaxy

```typescript
import axios from 'axios'

interface LinkedInActionResult {
  success: boolean
  action_type: 'connection_request' | 'message' | 'profile_visit' | 'like' | 'comment'
  waalaxy_campaign_id: string | null
  sent_at: string
  delay_applied_ms: number
}

class SubAgent5b_EnvoyeurLinkedIn {
  private waalaxyBaseUrl = 'https://api.waalaxy.com/v1'
  private dailyLimits = {
    connection_requests: 25,  // Safe: 15-30/jour
    messages: 80,             // Safe: 50-100/jour
    profile_views: 150,       // Safe: 100-200/jour
    likes: 40,                // Safe: 20-50/jour
    comments: 15,             // Safe: 10-20/jour
  }

  async process(input: SuiveurInput): Promise<LinkedInActionResult> {
    const actionType = this.getActionType(input)

    // 1. Verifier les limites journalieres
    const limitOK = await this.checkDailyLimit(actionType)
    if (!limitOK) {
      // Reporter a demain
      const tomorrowMs = this.getNextBusinessDayMs()
      await this.reschedule(input, tomorrowMs)
      return { success: false, action_type: actionType, waalaxy_campaign_id: null, sent_at: '', delay_applied_ms: 0 }
    }

    // 2. Verifier sante du compte LinkedIn
    const accountHealth = await this.checkAccountHealth()
    if (accountHealth.restricted) {
      await this.handleRestriction(accountHealth)
      throw new Error('LINKEDIN_RESTRICTED: compte en restriction')
    }

    // 3. Appliquer un delai randomise (120-300 secondes)
    const randomDelay = Math.floor(Math.random() * (300 - 120 + 1) + 120) * 1000
    await this.sleep(randomDelay)

    // 4. Executer l'action
    try {
      let result: LinkedInActionResult

      switch (actionType) {
        case 'connection_request':
          result = await this.sendConnectionRequest(input, randomDelay)
          break
        case 'message':
          result = await this.sendMessage(input, randomDelay)
          break
        case 'profile_visit':
          result = await this.visitProfile(input, randomDelay)
          break
        default:
          throw new Error(`Action LinkedIn inconnue: ${actionType}`)
      }

      // 5. Logger
      await this.logAction(input, result)

      // 6. Incrementer compteur
      await this.incrementDailyCounter(actionType)

      // 7. Planifier prochaine etape
      await this.scheduleNextLinkedInStep(input)

      return result
    } catch (error: any) {
      await this.handleLinkedInError(input, error)
      throw error
    }
  }

  private async sendConnectionRequest(
    input: SuiveurInput,
    delayApplied: number
  ): Promise<LinkedInActionResult> {
    if (!input.linkedin_message?.connection_note) {
      throw new Error('connection_note manquant dans linkedin_message')
    }

    // Verifier que la note ne depasse pas 300 caracteres
    const note = input.linkedin_message.connection_note.content
    if (note.length > 300) {
      throw new Error(`Connection note trop longue: ${note.length}/300 caracteres`)
    }

    // Via Waalaxy webhook/API
    const response = await axios.post(
      `${this.waalaxyBaseUrl}/campaigns/actions`,
      {
        action: 'send_connection',
        linkedin_url: input.prospect.linkedin_url,
        note: note,
        tags: [
          `axiom-${input.scoring.categorie.toLowerCase()}`,
          `seq-${input.sequence.sequence_id}`,
          `step-${input.sequence.etape_actuelle}`,
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${input.message_id}_linkedin_conn`,
        },
      }
    )

    return {
      success: true,
      action_type: 'connection_request',
      waalaxy_campaign_id: response.data.campaign_id,
      sent_at: new Date().toISOString(),
      delay_applied_ms: delayApplied,
    }
  }

  private async sendMessage(
    input: SuiveurInput,
    delayApplied: number
  ): Promise<LinkedInActionResult> {
    if (!input.linkedin_message?.post_connection_message) {
      throw new Error('post_connection_message manquant')
    }

    // Verifier que le prospect est deja connecte (1st degree)
    const isConnected = await this.checkConnectionStatus(input.prospect.linkedin_url!)

    if (!isConnected) {
      // Pas connecte : envoyer d'abord une demande de connexion
      console.warn(`[Agent5b] Prospect ${input.prospect_id} pas connecte, envoi connection request d'abord`)
      return await this.sendConnectionRequest(input, delayApplied)
    }

    const message = input.linkedin_message.post_connection_message.content

    const response = await axios.post(
      `${this.waalaxyBaseUrl}/campaigns/actions`,
      {
        action: 'send_message',
        linkedin_url: input.prospect.linkedin_url,
        message: message,
        tags: [
          `axiom-${input.scoring.categorie.toLowerCase()}`,
          `step-${input.sequence.etape_actuelle}`,
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${input.message_id}_linkedin_msg`,
        },
      }
    )

    return {
      success: true,
      action_type: 'message',
      waalaxy_campaign_id: response.data.campaign_id,
      sent_at: new Date().toISOString(),
      delay_applied_ms: delayApplied,
    }
  }

  private async visitProfile(
    input: SuiveurInput,
    delayApplied: number
  ): Promise<LinkedInActionResult> {
    const response = await axios.post(
      `${this.waalaxyBaseUrl}/campaigns/actions`,
      {
        action: 'visit_profile',
        linkedin_url: input.prospect.linkedin_url,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    return {
      success: true,
      action_type: 'profile_visit',
      waalaxy_campaign_id: response.data.campaign_id,
      sent_at: new Date().toISOString(),
      delay_applied_ms: delayApplied,
    }
  }

  private getActionType(input: SuiveurInput): 'connection_request' | 'message' | 'profile_visit' {
    switch (input.message.canal) {
      case 'linkedin_connection': return 'connection_request'
      case 'linkedin_message': return 'message'
      case 'linkedin_inmail': return 'message'
      default: return 'profile_visit'
    }
  }

  private async checkDailyLimit(actionType: string): Promise<boolean> {
    const count = await db.query(
      `SELECT COUNT(*) as count FROM linkedin_actions
       WHERE action_type = $1 AND created_at >= CURRENT_DATE`,
      [actionType]
    )
    const limit = this.dailyLimits[actionType as keyof typeof this.dailyLimits] || 20
    return count.rows[0].count < limit
  }

  private async checkAccountHealth(): Promise<{
    restricted: boolean
    restrictionType: string | null
    recoveryDays: number | null
  }> {
    // Verifier les signes de restriction
    const recentActions = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count,
        COUNT(*) FILTER (WHERE status = 'RATE_LIMITED') as rate_limited_count,
        COUNT(*) as total_count
      FROM linkedin_actions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `)

    const failRate = recentActions.rows[0].failed_count / Math.max(recentActions.rows[0].total_count, 1)
    const rateLimitedCount = recentActions.rows[0].rate_limited_count

    if (rateLimitedCount > 3) {
      return { restricted: true, restrictionType: 'RATE_LIMITED', recoveryDays: 3 }
    }
    if (failRate > 0.3) {
      return { restricted: true, restrictionType: 'HIGH_FAIL_RATE', recoveryDays: 7 }
    }

    return { restricted: false, restrictionType: null, recoveryDays: null }
  }

  private async handleRestriction(health: { restrictionType: string | null; recoveryDays: number | null }): Promise<void> {
    // 1. Arreter TOUTE automation LinkedIn
    await db.query(`
      UPDATE linkedin_actions SET status = 'PAUSED_RESTRICTION'
      WHERE status = 'PENDING' AND created_at >= CURRENT_DATE
    `)

    // 2. Notifier Jonathan
    await notifySlack({
      channel: '#sales-alerts',
      text: `ALERTE LINKEDIN: Restriction detectee (${health.restrictionType}). Toute automation LinkedIn est en pause pour ${health.recoveryDays} jours.`,
      priority: 'HIGH',
    })

    // 3. Logger
    await db.query(`
      INSERT INTO linkedin_restrictions (
        restriction_type, detected_at, recovery_days, status
      ) VALUES ($1, NOW(), $2, 'ACTIVE')
    `, [health.restrictionType, health.recoveryDays])
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

#### 3b.3 Likes/comments automatiques (engagement pre-contact)

```typescript
class LinkedInEngagement {
  // Avant d'envoyer une demande de connexion, engager avec le contenu du prospect
  async preContactEngagement(input: SuiveurInput): Promise<void> {
    const linkedinUrl = input.prospect.linkedin_url
    if (!linkedinUrl) return

    // Jour J-2 : Visiter le profil
    await this.scheduleAction({
      action: 'visit_profile',
      linkedin_url: linkedinUrl,
      delay_days: -2,
      prospect_id: input.prospect_id,
    })

    // Jour J-1 : Liker un post recent (si existe)
    await this.scheduleAction({
      action: 'like_recent_post',
      linkedin_url: linkedinUrl,
      delay_days: -1,
      prospect_id: input.prospect_id,
    })

    // Jour J : Envoyer la demande de connexion (geree par le flow principal)
  }

  private async scheduleAction(params: {
    action: string
    linkedin_url: string
    delay_days: number
    prospect_id: string
  }): Promise<void> {
    const delayMs = Math.max(0, params.delay_days * 24 * 60 * 60 * 1000)

    await linkedinQueue.add(
      `engagement-${params.prospect_id}-${params.action}`,
      params,
      {
        delay: delayMs,
        priority: 8, // Basse priorite (engagement < envoi)
      }
    )
  }
}
```

#### 3b.4 Volumes et limites LinkedIn

| Action | Limite safe/jour | Limite max/semaine | Intervalle min entre actions |
|---|---|---|---|
| Demandes de connexion | 25 | 100-150 | 120-300 secondes (randomise) |
| Messages (1st degree) | 80 | 400 | 120-300 secondes |
| Visites de profil | 150 | 750 | 60-120 secondes |
| Likes | 40 | 200 | 30-60 secondes |
| Comments | 15 | 75 | 300-600 secondes |

**Regle critique : jamais de pattern parfait.** Tous les delais sont randomises. Pas d'activite le weekend. Heures variables entre 8h et 18h.

#### 3b.5 Detection de ban LinkedIn

```typescript
const LINKEDIN_BAN_SIGNALS = {
  tier1_warning: [
    'pending_connections_stalling',      // Acceptance rate chute sous 20%
    'message_delivery_delayed',          // Messages non distribues
    'profile_views_reset',               // Compteur remis a zero
  ],
  tier2_temp_ban: [
    'too_many_requests_message',         // "You've sent too many requests"
    'account_locked',                    // Compte verrouille 3-14 jours
    'id_verification_required',          // Verification identite requise
  ],
  tier3_permanent_ban: [
    'account_disabled',                  // Compte desactive
    'appeal_rejected',                   // Appel refuse
  ],
}

// Processus de recovery
const LINKEDIN_RECOVERY_PLAN = {
  immediate: {
    actions: ['STOP_ALL_AUTOMATION'],
    duration_hours: 48,
  },
  warmup: {
    actions: ['MANUAL_ONLY', 'LIKES_COMMENTS_ONLY'],
    volume: { max_actions_per_day: 10 },
    duration_days: 7,
  },
  gradual_resume: {
    actions: ['CONNECTIONS_5_PER_DAY', 'MESSAGES_10_PER_DAY'],
    duration_days: 7,
  },
  full_resume: {
    actions: ['INCREASE_50_PCT', 'THEN_75_PCT', 'THEN_NORMAL'],
    milestones: [15, 22, 30], // jours
  },
}
```

#### 3b.6 Couts LinkedIn

| Poste | Cout mensuel | Notes |
|---|---|---|
| Waalaxy Pro | 19 EUR/mois | 300+ invitations, auto-messages |
| LinkedIn Sales Navigator (optionnel) | 79 EUR/mois | InMails, filtres avances |
| Expandi (alternative) | 99 EUR/mois | Cloud-based, IPs dediees |

---

### 3c. DETECTEUR DE REPONSES

#### 3c.1 Architecture technique

```
Sources de reponses :
  |
  +-- Gmail API Watch (webhook, < 1s latence)
  +-- IMAP polling (fallback, 30s intervalle)
  +-- Waalaxy webhooks (reponses LinkedIn)
  |
  v
+-------------------------------------------+
| SOUS-AGENT 5c : DETECTEUR DE REPONSES    |
| 1. Recevoir notification de reponse       |
| 2. Recuperer contenu complet              |
| 3. Matcher avec prospect/sequence         |
| 4. Classifier via Claude API             |
| 5. Executer action selon categorie        |
| 6. Notifier si necessaire                 |
+-------------------------------------------+
  |
  v
Classification + action --> Log en base
```

#### 3c.2 Gmail API Watch (methode principale)

```typescript
import { google, gmail_v1 } from 'googleapis'
import { PubSub } from '@google-cloud/pubsub'

class GmailWatcher {
  private gmail: gmail_v1.Gmail
  private pubsub: PubSub

  constructor(auth: any) {
    this.gmail = google.gmail({ version: 'v1', auth })
    this.pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID })
  }

  // Setup initial : a appeler une fois, puis renouveler tous les 7 jours
  async setupWatch(): Promise<void> {
    const response = await this.gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: `projects/${process.env.GCP_PROJECT_ID}/topics/gmail-axiom-replies`,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      },
    })

    console.log(`[Agent5c] Gmail Watch active. Expiration: ${response.data.expiration}`)

    // Stocker expiration pour renouvellement
    await db.query(`
      INSERT INTO system_config (key, value, updated_at)
      VALUES ('gmail_watch_expiration', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [response.data.expiration])
  }

  // Renouveler le watch avant expiration (cron toutes les 6 jours)
  async renewWatch(): Promise<void> {
    await this.gmail.users.stop({ userId: 'me' })
    await this.setupWatch()
  }

  // Handler de notification Pub/Sub
  async handlePubSubNotification(message: any): Promise<void> {
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString())
    const historyId = data.historyId

    // Recuperer les messages depuis le dernier historyId connu
    const lastHistoryId = await this.getLastProcessedHistoryId()

    try {
      const history = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: lastHistoryId,
        historyTypes: ['messageAdded'],
        labelId: 'INBOX',
      })

      if (!history.data.history) return

      for (const record of history.data.history) {
        if (record.messagesAdded) {
          for (const added of record.messagesAdded) {
            await this.processNewMessage(added.message!.id!)
          }
        }
      }

      // Mettre a jour le dernier historyId traite
      await this.saveLastProcessedHistoryId(historyId)
    } catch (error: any) {
      if (error.code === 404) {
        // historyId expire, refaire un full sync
        await this.fullSync()
      } else {
        throw error
      }
    }

    message.ack()
  }

  private async processNewMessage(messageId: string): Promise<void> {
    // Recuperer le message complet
    const msg = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const headers = msg.data.payload?.headers || []
    const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value

    // Verifier si c'est une reponse a un de nos emails
    const inReplyTo = getHeader('In-Reply-To')
    const references = getHeader('References')
    const fromAddress = getHeader('From')
    const subject = getHeader('Subject')

    // Matcher avec un email envoye
    const originalSend = await this.matchWithSentEmail(inReplyTo, references, fromAddress)

    if (!originalSend) {
      // Ce n'est pas une reponse a nos emails
      return
    }

    // Extraire le corps du message
    const body = this.extractBody(msg.data.payload!)

    // Passer au classificateur (sous-agent 5c suite)
    await replyClassifier.classify({
      reply_id: messageId,
      prospect_id: originalSend.prospect_id,
      sequence_id: originalSend.sequence_id,
      etape_repondue: originalSend.etape_numero,
      email_body: body,
      from_address: fromAddress!,
      subject: subject!,
      received_at: new Date().toISOString(),
      original_message_id: originalSend.message_id,
    })
  }

  private async matchWithSentEmail(
    inReplyTo: string | undefined,
    references: string | undefined,
    fromAddress: string | undefined
  ): Promise<any> {
    // Methode 1 : Match par In-Reply-To header
    if (inReplyTo) {
      const match = await db.query(
        `SELECT * FROM email_sends WHERE gmail_message_id = $1 OR idempotency_key LIKE $2`,
        [inReplyTo, `%${inReplyTo}%`]
      )
      if (match.rows.length > 0) return match.rows[0]
    }

    // Methode 2 : Match par References header
    if (references) {
      const refIds = references.split(/\s+/)
      for (const refId of refIds) {
        const match = await db.query(
          `SELECT * FROM email_sends WHERE gmail_message_id = $1`,
          [refId]
        )
        if (match.rows.length > 0) return match.rows[0]
      }
    }

    // Methode 3 : Match par adresse email de l'expediteur
    if (fromAddress) {
      const emailMatch = fromAddress.match(/<(.+?)>/) || [null, fromAddress]
      const email = emailMatch[1]
      const match = await db.query(
        `SELECT es.* FROM email_sends es
         JOIN prospects p ON es.prospect_id = p.prospect_id
         WHERE p.email = $1
         AND es.sent_at >= NOW() - INTERVAL '60 days'
         ORDER BY es.sent_at DESC LIMIT 1`,
        [email]
      )
      if (match.rows.length > 0) return match.rows[0]
    }

    return null
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart): string {
    // Extraire texte brut
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8')
    }

    // Recursion dans les parts multipart
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
      }
      // Fallback sur HTML si pas de plain text
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          const html = Buffer.from(part.body.data, 'base64').toString('utf-8')
          return this.stripHtml(html)
        }
      }
    }

    return ''
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
  }
}

// Configuration Pub/Sub listener
const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID })
const subscription = pubsub.subscription('gmail-axiom-replies-sub')

subscription.on('message', async (message) => {
  await gmailWatcher.handlePubSubNotification(message)
})

subscription.on('error', (error) => {
  console.error('[Agent5c] Pub/Sub error:', error)
})
```

#### 3c.3 IMAP Polling (fallback)

```typescript
import Imap from 'imap'
import { simpleParser } from 'mailparser'

class ImapPoller {
  private imap: Imap
  private pollingIntervalMs = 30000 // 30 secondes

  constructor() {
    this.imap = new Imap({
      user: process.env.GMAIL_USER!,
      password: process.env.GMAIL_APP_PASSWORD!,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    })
  }

  async startPolling(): Promise<void> {
    this.imap.connect()

    this.imap.once('ready', () => {
      console.log('[Agent5c] IMAP connecte, debut du polling')
      this.poll()
      setInterval(() => this.poll(), this.pollingIntervalMs)
    })

    this.imap.on('error', (error: Error) => {
      console.error('[Agent5c] IMAP error:', error)
      // Reconnexion automatique
      setTimeout(() => this.imap.connect(), 5000)
    })
  }

  private async poll(): Promise<void> {
    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('[Agent5c] Erreur ouverture inbox:', err)
        return
      }

      // Chercher les emails non lus
      this.imap.search(['UNSEEN'], (err, uids) => {
        if (err || !uids.length) return

        const fetch = this.imap.fetch(uids, { bodies: '' })

        fetch.on('message', (msg) => {
          msg.on('body', async (stream) => {
            const parsed = await simpleParser(stream)
            await this.processReply(parsed)
          })
        })
      })
    })
  }

  private async processReply(parsed: any): Promise<void> {
    const inReplyTo = parsed.inReplyTo
    const fromAddress = parsed.from?.value?.[0]?.address
    const body = parsed.text || ''

    // Matcher avec un email envoye
    const originalSend = await matchWithSentEmail(inReplyTo, null, fromAddress)
    if (!originalSend) return

    await replyClassifier.classify({
      reply_id: parsed.messageId,
      prospect_id: originalSend.prospect_id,
      sequence_id: originalSend.sequence_id,
      etape_repondue: originalSend.etape_numero,
      email_body: body,
      from_address: fromAddress,
      subject: parsed.subject,
      received_at: parsed.date?.toISOString() || new Date().toISOString(),
      original_message_id: originalSend.message_id,
    })
  }
}
```

#### 3c.4 Detection reponses LinkedIn (via Waalaxy webhook)

```typescript
import express from 'express'

// Webhook endpoint pour recevoir les notifications Waalaxy
const webhookRouter = express.Router()

webhookRouter.post('/webhooks/waalaxy', async (req, res) => {
  const { event, data } = req.body

  // Verifier la signature du webhook
  const signature = req.headers['x-waalaxy-signature']
  if (!verifyWaalaxySignature(req.body, signature as string)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  switch (event) {
    case 'message_received':
      await handleLinkedInReply({
        prospect_linkedin_url: data.contact_linkedin_url,
        message_content: data.message_content,
        received_at: data.timestamp,
        campaign_id: data.campaign_id,
      })
      break

    case 'connection_accepted':
      await handleConnectionAccepted({
        prospect_linkedin_url: data.contact_linkedin_url,
        accepted_at: data.timestamp,
      })
      break

    case 'connection_rejected':
      await handleConnectionRejected({
        prospect_linkedin_url: data.contact_linkedin_url,
      })
      break
  }

  res.status(200).json({ received: true })
})

async function handleLinkedInReply(data: {
  prospect_linkedin_url: string
  message_content: string
  received_at: string
  campaign_id: string
}): Promise<void> {
  // Trouver le prospect
  const prospect = await db.query(
    `SELECT * FROM prospects WHERE linkedin_url = $1`,
    [data.prospect_linkedin_url]
  )

  if (prospect.rows.length === 0) {
    console.warn(`[Agent5c] Reponse LinkedIn de prospect inconnu: ${data.prospect_linkedin_url}`)
    return
  }

  const prospectData = prospect.rows[0]

  // Classifier la reponse (meme logique que pour email)
  await replyClassifier.classify({
    reply_id: `linkedin-${Date.now()}`,
    prospect_id: prospectData.prospect_id,
    sequence_id: prospectData.current_sequence_id,
    etape_repondue: prospectData.current_step,
    email_body: data.message_content, // meme champ, contenu LinkedIn
    from_address: data.prospect_linkedin_url,
    subject: 'LinkedIn DM',
    received_at: data.received_at,
    original_message_id: null,
    canal: 'linkedin',
  })
}

async function handleConnectionAccepted(data: {
  prospect_linkedin_url: string
  accepted_at: string
}): Promise<void> {
  // Mettre a jour le statut de connexion
  await db.query(
    `UPDATE prospects SET linkedin_connected = true, linkedin_connected_at = $1
     WHERE linkedin_url = $2`,
    [data.accepted_at, data.prospect_linkedin_url]
  )

  // Logger l'evenement
  const prospect = await db.query(
    `SELECT prospect_id FROM prospects WHERE linkedin_url = $1`,
    [data.prospect_linkedin_url]
  )

  if (prospect.rows.length > 0) {
    await logInteraction({
      prospect_id: prospect.rows[0].prospect_id,
      type: 'LINKEDIN_CONNECTION_ACCEPTED',
      canal: 'linkedin',
      timestamp: data.accepted_at,
    })

    // Declencher l'envoi du post-connection message si prevu dans la sequence
    await triggerPostConnectionMessage(prospect.rows[0].prospect_id)
  }
}
```

#### 3c.5 Classification IA via Claude API

```typescript
import Anthropic from '@anthropic-ai/sdk'

interface ReplyClassification {
  category: 'INTERESSE' | 'INTERESSE_SOFT' | 'PAS_MAINTENANT' | 'PAS_INTERESSE' |
            'MAUVAISE_PERSONNE' | 'DEMANDE_INFO' | 'OUT_OF_OFFICE' | 'SPAM'
  confidence: number         // 0.0 - 1.0
  sentiment: 'positif' | 'neutre' | 'negatif'
  action_suggeree: string
  date_retour_ooo: string | null       // Pour OUT_OF_OFFICE
  personne_referree: {                 // Pour MAUVAISE_PERSONNE
    nom: string | null
    email: string | null
    poste: string | null
  } | null
  phrase_cle: string                   // Citation representative
  raisonnement: string                 // Explication de la classification
}

class ReplyClassifier {
  private anthropic: Anthropic

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  // ============================================================
  // PROMPT COMPLET DE CLASSIFICATION (NE PAS MODIFIER SANS TEST)
  // ============================================================
  private readonly SYSTEM_PROMPT = `Tu es un expert en classification de reponses a des emails de prospection B2B pour Axiom Marketing, une agence de marketing digital basee en France.

CONTEXTE :
- Axiom Marketing envoie des emails de prospection a des entreprises francaises et internationales.
- Les prospects sont des decideurs (CEO, CMO, CTO, VP Marketing, etc.)
- Les messages proposes sont personnalises, bases sur des signaux business reels.
- Jonathan Dewaele est le fondateur d'Axiom Marketing.

TA MISSION :
Analyser la reponse du prospect et la classifier dans UNE SEULE des 8 categories ci-dessous.

CATEGORIES :

1. INTERESSE
   - Le prospect exprime un interet clair pour un echange (call, meeting, demo)
   - Exemples : "Oui, on peut en discuter", "Ca m'interesse, quand etes-vous disponible ?", "Envoyez-moi un creneau"
   - Action : Notifier Jonathan IMMEDIATEMENT, arreter la sequence

2. INTERESSE_SOFT
   - Le prospect montre de l'interet mais demande plus d'informations avant de s'engager
   - Exemples : "Pouvez-vous m'en dire plus ?", "C'est interessant, comment ca marche ?", "Envoyez-moi une presentation"
   - Action : Notifier Jonathan sous 1h, preparer info supplementaire

3. PAS_MAINTENANT
   - Le prospect est potentiellement interesse mais pas au bon moment
   - Exemples : "Pas le bon moment, recontactez-moi en septembre", "On vient de signer un contrat", "Budget boucle pour cette annee"
   - Action : Reporter la sequence de 30 jours (ou date specifique si mentionnee)

4. PAS_INTERESSE
   - Le prospect decline clairement, sans agressivite ni demande de desabonnement
   - Exemples : "Ca ne nous concerne pas", "Nous avons deja un prestataire", "Pas notre priorite"
   - Action : Arreter la sequence, archiver, pas de recontact

5. MAUVAISE_PERSONNE
   - Le prospect indique que quelqu'un d'autre serait plus adapte
   - Exemples : "Contactez plutot Marie du marketing", "Je ne gere plus ce sujet, voyez avec le nouveau CTO"
   - Action : Creer un nouveau lead pour la personne referree, arreter sequence actuelle

6. DEMANDE_INFO
   - Le prospect pose une question specifique sans exprimer clairement de l'interet ou du desinteret
   - Exemples : "Quels sont vos tarifs ?", "Vous avez des references dans notre secteur ?", "Comment ca s'integre avec Salesforce ?"
   - Action : Repondre a la question, planifier un follow-up dans 3 jours

7. OUT_OF_OFFICE
   - Reponse automatique d'absence
   - Exemples : "Je suis absent jusqu'au 25 mars", auto-reply standard
   - Action : Pauser la sequence, reprendre 2 jours apres la date de retour

8. SPAM
   - Message irrelevant, pub d'un tiers, tentative de vente inverse
   - Exemples : Offre commerciale non sollicitee, newsletter, notification systeme
   - Action : Ignorer, archiver

INSTRUCTIONS DE REPONSE :
- Reponds UNIQUEMENT en JSON valide (pas de markdown, pas de commentaires)
- Sois precis dans ta classification et ton raisonnement
- Si tu hesites entre deux categories, choisis celle avec l'impact le plus eleve (INTERESSE > INTERESSE_SOFT > DEMANDE_INFO)
- Extrais toujours la phrase cle qui justifie ta classification
- Pour OUT_OF_OFFICE, extrais la date de retour si disponible (format YYYY-MM-DD)
- Pour MAUVAISE_PERSONNE, extrais le nom, email et poste de la personne referree si mentionnes

FORMAT JSON ATTENDU :
{
  "category": "INTERESSE|INTERESSE_SOFT|PAS_MAINTENANT|PAS_INTERESSE|MAUVAISE_PERSONNE|DEMANDE_INFO|OUT_OF_OFFICE|SPAM",
  "confidence": 0.95,
  "sentiment": "positif|neutre|negatif",
  "action_suggeree": "Description de l'action a prendre",
  "date_retour_ooo": "YYYY-MM-DD ou null",
  "personne_referree": {
    "nom": "Prenom Nom ou null",
    "email": "email@domain.com ou null",
    "poste": "Titre du poste ou null"
  },
  "phrase_cle": "Citation exacte du message qui justifie la classification",
  "raisonnement": "Explication en 1-2 phrases de pourquoi cette categorie"
}`

  async classify(replyData: {
    reply_id: string
    prospect_id: string
    sequence_id: string
    etape_repondue: number
    email_body: string
    from_address: string
    subject: string
    received_at: string
    original_message_id: string | null
    canal?: string
  }): Promise<ReplyClassification> {
    // Recuperer le contexte du prospect
    const prospect = await db.query(
      `SELECT p.*, es.body_preview as dernier_message_envoye, es.subject_line as dernier_sujet
       FROM prospects p
       LEFT JOIN email_sends es ON es.prospect_id = p.prospect_id
       WHERE p.prospect_id = $1
       ORDER BY es.sent_at DESC LIMIT 1`,
      [replyData.prospect_id]
    )
    const prospectCtx = prospect.rows[0] || {}

    const userMessage = `REPONSE RECUE :
De : ${replyData.from_address}
Sujet : ${replyData.subject}
Date : ${replyData.received_at}
Canal : ${replyData.canal || 'email'}

Contenu :
"${replyData.email_body}"

CONTEXTE DU PROSPECT :
- Entreprise : ${prospectCtx.entreprise_nom || 'Inconnue'}
- Poste : ${prospectCtx.poste || 'Inconnu'}
- Prenom : ${prospectCtx.prenom || 'Inconnu'}
- Score : ${prospectCtx.score_total || 'N/A'} (${prospectCtx.categorie || 'N/A'})
- Etape de sequence : ${replyData.etape_repondue} / ${prospectCtx.etape_total || '?'}
- Dernier message envoye : "${prospectCtx.dernier_message_envoye || 'N/A'}"
- Dernier sujet : "${prospectCtx.dernier_sujet || 'N/A'}"`

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: this.SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parser le JSON (gerer les cas ou Claude ajoute du markdown)
    let jsonStr = text
    if (text.includes('```json')) {
      jsonStr = text.split('```json')[1].split('```')[0]
    } else if (text.includes('```')) {
      jsonStr = text.split('```')[1].split('```')[0]
    }

    const classification: ReplyClassification = JSON.parse(jsonStr.trim())

    // Stocker en base
    await this.storeClassification(replyData, classification, response.usage)

    // Executer l'action correspondante
    await this.executeAction(replyData, classification)

    return classification
  }

  private async storeClassification(
    replyData: any,
    classification: ReplyClassification,
    usage: any
  ): Promise<void> {
    await db.query(`
      INSERT INTO reply_classifications (
        reply_id, prospect_id, sequence_id, etape_repondue,
        email_body, from_address, canal,
        category, confidence, sentiment,
        action_suggeree, date_retour_ooo,
        personne_referree_nom, personne_referree_email, personne_referree_poste,
        phrase_cle, raisonnement,
        classification_model, classification_cost_usd,
        tokens_input, tokens_output,
        received_at, classified_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
    `, [
      replyData.reply_id, replyData.prospect_id, replyData.sequence_id,
      replyData.etape_repondue, replyData.email_body, replyData.from_address,
      replyData.canal || 'email',
      classification.category, classification.confidence, classification.sentiment,
      classification.action_suggeree, classification.date_retour_ooo,
      classification.personne_referree?.nom, classification.personne_referree?.email,
      classification.personne_referree?.poste,
      classification.phrase_cle, classification.raisonnement,
      'claude-sonnet-4-20250514',
      ((usage.input_tokens / 1000000) * 3.0 + (usage.output_tokens / 1000000) * 15.0),
      usage.input_tokens, usage.output_tokens,
      replyData.received_at,
    ])
  }

  private async executeAction(
    replyData: any,
    classification: ReplyClassification
  ): Promise<void> {
    switch (classification.category) {
      case 'INTERESSE':
        await this.handleInteresse(replyData, classification)
        break
      case 'INTERESSE_SOFT':
        await this.handleInteresseSoft(replyData, classification)
        break
      case 'PAS_MAINTENANT':
        await this.handlePasMaintenant(replyData, classification)
        break
      case 'PAS_INTERESSE':
        await this.handlePasInteresse(replyData, classification)
        break
      case 'MAUVAISE_PERSONNE':
        await this.handleMauvaisePersonne(replyData, classification)
        break
      case 'DEMANDE_INFO':
        await this.handleDemandeInfo(replyData, classification)
        break
      case 'OUT_OF_OFFICE':
        await this.handleOutOfOffice(replyData, classification)
        break
      case 'SPAM':
        await this.handleSpam(replyData)
        break
    }
  }

  // --- Actions par categorie ---

  private async handleInteresse(replyData: any, classification: ReplyClassification): Promise<void> {
    // 1. Arreter la sequence IMMEDIATEMENT
    await this.stopSequence(replyData.prospect_id, replyData.sequence_id)

    // 2. Mettre a jour le statut prospect
    await db.query(
      `UPDATE prospects SET status = 'INTERESTED', last_reply_at = NOW(),
       interest_level = 'HOT' WHERE prospect_id = $1`,
      [replyData.prospect_id]
    )

    // 3. Notifier Jonathan en < 5 minutes (SLA)
    await notifyJonathan({
      type: 'HOT_LEAD_REPLY',
      prospect_id: replyData.prospect_id,
      priority: 'URGENT',
      reply_snippet: classification.phrase_cle,
      full_reply: replyData.email_body,
      action: classification.action_suggeree,
      sla_minutes: 5,
    })
  }

  private async handleInteresseSoft(replyData: any, classification: ReplyClassification): Promise<void> {
    // 1. Pauser la sequence (ne pas envoyer le prochain step automatiquement)
    await this.pauseSequence(replyData.prospect_id, replyData.sequence_id)

    // 2. Mettre a jour le statut
    await db.query(
      `UPDATE prospects SET status = 'SOFT_INTEREST', last_reply_at = NOW()
       WHERE prospect_id = $1`,
      [replyData.prospect_id]
    )

    // 3. Notifier Jonathan sous 1h
    await notifyJonathan({
      type: 'SOFT_INTEREST_REPLY',
      prospect_id: replyData.prospect_id,
      priority: 'HIGH',
      reply_snippet: classification.phrase_cle,
      full_reply: replyData.email_body,
      action: classification.action_suggeree,
      sla_minutes: 60,
    })
  }

  private async handlePasMaintenant(replyData: any, classification: ReplyClassification): Promise<void> {
    // 1. Arreter la sequence actuelle
    await this.stopSequence(replyData.prospect_id, replyData.sequence_id)

    // 2. Calculer la date de reprise (30 jours par defaut, ou date specifique)
    let resumeDate: Date
    if (classification.date_retour_ooo) {
      resumeDate = new Date(classification.date_retour_ooo)
    } else {
      resumeDate = new Date()
      resumeDate.setDate(resumeDate.getDate() + 30)
    }

    // 3. Planifier une reprise
    await db.query(
      `UPDATE prospects SET status = 'PAUSED', paused_reason = 'PAS_MAINTENANT',
       resume_date = $1, last_reply_at = NOW() WHERE prospect_id = $2`,
      [resumeDate.toISOString(), replyData.prospect_id]
    )

    // 4. Creer un job pour relancer dans 30 jours
    await suiveurQueue.add(
      `resume-${replyData.prospect_id}`,
      {
        type: 'RESUME_SEQUENCE',
        prospect_id: replyData.prospect_id,
        reason: 'PAS_MAINTENANT_EXPIRED',
      },
      {
        delay: resumeDate.getTime() - Date.now(),
        priority: 5,
      }
    )
  }

  private async handlePasInteresse(replyData: any, classification: ReplyClassification): Promise<void> {
    // 1. Arreter toutes les sequences
    await this.stopAllSequences(replyData.prospect_id)

    // 2. Supprimer le prospect (pas de recontact)
    await db.query(
      `UPDATE prospects SET status = 'SUPPRESSED', suppressed_reason = 'NOT_INTERESTED',
       suppressed_at = NOW() WHERE prospect_id = $1`,
      [replyData.prospect_id]
    )
  }

  private async handleMauvaisePersonne(replyData: any, classification: ReplyClassification): Promise<void> {
    // 1. Arreter la sequence actuelle
    await this.stopSequence(replyData.prospect_id, replyData.sequence_id)

    // 2. Creer un nouveau prospect pour la personne referree
    if (classification.personne_referree?.nom || classification.personne_referree?.email) {
      await db.query(`
        INSERT INTO referral_leads (
          original_prospect_id, referred_name, referred_email,
          referred_poste, source_reply_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        replyData.prospect_id,
        classification.personne_referree?.nom,
        classification.personne_referree?.email,
        classification.personne_referree?.poste,
        replyData.reply_id,
      ])

      // Notifier Jonathan pour validation avant de contacter la personne referree
      await notifyJonathan({
        type: 'REFERRAL_LEAD',
        prospect_id: replyData.prospect_id,
        priority: 'MEDIUM',
        reply_snippet: classification.phrase_cle,
        action: `Personne referree : ${classification.personne_referree?.nom} (${classification.personne_referree?.email || 'email inconnu'})`,
        sla_minutes: 480,
      })
    }
  }

  private async handleDemandeInfo(replyData: any, classification: ReplyClassification): Promise<void> {
    // 1. Pauser la sequence
    await this.pauseSequence(replyData.prospect_id, replyData.sequence_id)

    // 2. Notifier Jonathan pour repondre manuellement
    await notifyJonathan({
      type: 'INFO_REQUEST',
      prospect_id: replyData.prospect_id,
      priority: 'MEDIUM',
      reply_snippet: classification.phrase_cle,
      full_reply: replyData.email_body,
      action: classification.action_suggeree,
      sla_minutes: 480,
    })
  }

  private async handleOutOfOffice(replyData: any, classification: ReplyClassification): Promise<void> {
    // 1. Pauser la sequence
    await this.pauseSequence(replyData.prospect_id, replyData.sequence_id)

    // 2. Calculer date de reprise (+2 jours apres retour)
    let resumeDate: Date
    if (classification.date_retour_ooo) {
      resumeDate = new Date(classification.date_retour_ooo)
      resumeDate.setDate(resumeDate.getDate() + 2) // +2 jours apres retour
    } else {
      // Pas de date, reprendre dans 14 jours par defaut
      resumeDate = new Date()
      resumeDate.setDate(resumeDate.getDate() + 14)
    }

    await db.query(
      `UPDATE prospects SET status = 'PAUSED', paused_reason = 'OUT_OF_OFFICE',
       ooo_return_date = $1, resume_date = $2 WHERE prospect_id = $3`,
      [classification.date_retour_ooo, resumeDate.toISOString(), replyData.prospect_id]
    )

    // 3. Planifier la reprise
    await suiveurQueue.add(
      `resume-ooo-${replyData.prospect_id}`,
      {
        type: 'RESUME_AFTER_OOO',
        prospect_id: replyData.prospect_id,
      },
      { delay: resumeDate.getTime() - Date.now() }
    )
  }

  private async handleSpam(replyData: any): Promise<void> {
    // Juste archiver, ne rien faire
    await db.query(
      `UPDATE reply_classifications SET handled = true WHERE reply_id = $1`,
      [replyData.reply_id]
    )
  }

  // --- Utilitaires sequences ---

  private async stopSequence(prospectId: string, sequenceId: string): Promise<void> {
    // Annuler tous les jobs BullMQ en attente pour ce prospect
    const pendingJobs = await suiveurQueue.getJobs(['delayed', 'waiting'])
    for (const job of pendingJobs) {
      if (job.data.prospect_id === prospectId && job.data.sequence_id === sequenceId) {
        await job.remove()
      }
    }

    await db.query(
      `UPDATE prospect_sequences SET status = 'STOPPED', stopped_at = NOW(),
       stopped_reason = 'REPLY_RECEIVED'
       WHERE prospect_id = $1 AND sequence_id = $2 AND status = 'ACTIVE'`,
      [prospectId, sequenceId]
    )
  }

  private async pauseSequence(prospectId: string, sequenceId: string): Promise<void> {
    await db.query(
      `UPDATE prospect_sequences SET status = 'PAUSED', paused_at = NOW()
       WHERE prospect_id = $1 AND sequence_id = $2 AND status = 'ACTIVE'`,
      [prospectId, sequenceId]
    )
  }

  private async stopAllSequences(prospectId: string): Promise<void> {
    await db.query(
      `UPDATE prospect_sequences SET status = 'STOPPED', stopped_at = NOW(),
       stopped_reason = 'PROSPECT_SUPPRESSED'
       WHERE prospect_id = $1 AND status IN ('ACTIVE', 'PAUSED')`,
      [prospectId]
    )
  }
}
```

#### 3c.6 Exemples de reponses et classifications attendues

| Reponse | Categorie attendue | Confidence | Action |
|---|---|---|---|
| "Oui ca m'interesse, on peut en discuter la semaine prochaine ?" | INTERESSE | 0.97 | Notifier Jonathan < 5min, arreter sequence |
| "Envoyez-moi plus de details sur vos offres" | INTERESSE_SOFT | 0.90 | Notifier < 1h, pauser sequence |
| "Pas le bon moment, on boucle notre budget Q1. Recontactez-moi en avril." | PAS_MAINTENANT | 0.93 | Arreter, reprendre le 1er avril |
| "Merci mais nous avons deja un prestataire pour ca." | PAS_INTERESSE | 0.92 | Arreter, archiver |
| "Je ne gere plus le marketing, contactez Sarah Martin sarah@company.fr" | MAUVAISE_PERSONNE | 0.95 | Creer lead Sarah, arreter |
| "Quels sont vos tarifs ?" | DEMANDE_INFO | 0.88 | Notifier, preparer reponse |
| "Je suis absent du bureau jusqu'au 25 mars. De retour le 26." | OUT_OF_OFFICE | 0.99 | Pauser, reprendre le 28 mars |
| "Profitez de -50% sur vos fournitures de bureau !" | SPAM | 0.98 | Ignorer |
| "Bonjour, j'ai bien recu votre message. Notre equipe est en pleine reflexion sur le sujet et nous pourrions avoir besoin d'accompagnement. Pouvez-vous me preciser vos disponibilites pour un call de 30 min ?" | INTERESSE | 0.96 | Notifier < 5min, arreter sequence |
| "Merci Jonathan. Le sujet est pertinent mais nous venons de demarrer un projet similaire en interne. Peut-etre dans 6 mois ?" | PAS_MAINTENANT | 0.91 | Reprendre dans 6 mois |

---

### 3d. ORCHESTRATEUR DE SEQUENCES

#### 3d.1 Architecture technique

```
Prospect entre dans le pipeline
    |
    v
+-------------------------------------------+
| SOUS-AGENT 5d : ORCHESTRATEUR SEQUENCES  |
| 1. Attribuer la sequence appropriee       |
| 2. Planifier chaque etape (jour/heure)    |
| 3. Appliquer "widening gap"               |
| 4. Gerer timezone (Reunion vs metro)      |
| 5. Respecter jours feries/weekends        |
| 6. Prioriser HOT > WARM > COLD           |
| 7. Arreter si reponse detectee            |
+-------------------------------------------+
    |
    v
Jobs BullMQ planifies pour chaque etape
```

#### 3d.2 Logique "Widening Gap" (espacement progressif)

```typescript
class SequenceOrchestrator {
  // Espacement entre les etapes : de plus en plus large
  // Etape 1 -> 2 : 2-3 jours
  // Etape 2 -> 3 : 4-5 jours
  // Etape 3 -> 4 : 7-10 jours
  // Etape 4+ : 10-14 jours

  private readonly WIDENING_GAP_DAYS: Record<string, number[]> = {
    // Pour HOT : sequence intensive, gaps courts
    'HOT': [0, 2, 5, 10],
    // Pour WARM : sequence standard
    'WARM': [0, 3, 7, 14, 21],
    // Pour COLD : sequence longue et espacee
    'COLD': [0, 3, 7, 14, 21, 30, 45],
  }

  async initializeSequence(input: SuiveurInput): Promise<void> {
    const categorie = input.scoring.categorie
    const gaps = this.WIDENING_GAP_DAYS[categorie] || this.WIDENING_GAP_DAYS['WARM']

    // Creer l'entree de sequence en base
    const sequenceRecord = await db.query(`
      INSERT INTO prospect_sequences (
        prospect_id, sequence_id, categorie, segment,
        total_steps, current_step, status,
        gaps_days, started_at
      ) VALUES ($1, $2, $3, $4, $5, 1, 'ACTIVE', $6, NOW())
      RETURNING id
    `, [
      input.prospect_id, input.sequence.sequence_id,
      categorie, input.scoring.segment,
      gaps.length, JSON.stringify(gaps),
    ])

    // Planifier toutes les etapes d'avance
    for (let step = 0; step < gaps.length; step++) {
      const dayOffset = gaps[step]
      const sendTime = await this.calculateSendTime(input, dayOffset)

      await suiveurQueue.add(
        `seq-${input.prospect_id}-step-${step + 1}`,
        {
          type: 'SEND_STEP',
          prospect_id: input.prospect_id,
          sequence_id: input.sequence.sequence_id,
          step_number: step + 1,
          total_steps: gaps.length,
          scheduled_for: sendTime.toISOString(),
        },
        {
          delay: sendTime.getTime() - Date.now(),
          priority: this.getPriority(categorie),
          jobId: `seq-${input.prospect_id}-step-${step + 1}`, // Pour pouvoir annuler
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )
    }
  }

  private getPriority(categorie: string): number {
    switch (categorie) {
      case 'HOT': return 1    // Priorite la plus haute
      case 'WARM': return 5
      case 'COLD': return 10
      default: return 10
    }
  }

  async calculateSendTime(input: SuiveurInput, dayOffset: number): Promise<Date> {
    const moment = require('moment-timezone')

    // Determiner la timezone du prospect
    const prospectTimezone = await this.getProspectTimezone(input)

    // Horaire optimal d'envoi (mardi-jeudi 8h-10h)
    const optimalHours = this.getOptimalSendHour(input.message.canal)

    // Partir de maintenant + dayOffset
    let sendTime = moment.tz(prospectTimezone).add(dayOffset, 'days')

    // Fixer l'heure optimale
    sendTime.set({
      hour: optimalHours.hour,
      minute: optimalHours.minute + Math.floor(Math.random() * 20), // +0-20min aleatoire
      second: Math.floor(Math.random() * 60),
    })

    // Ajuster si weekend ou jour ferie
    sendTime = await this.skipToNextBusinessDay(sendTime, prospectTimezone)

    // Si l'heure est deja passee, reporter au prochain jour ouvre
    if (sendTime.isBefore(moment())) {
      sendTime.add(1, 'day')
      sendTime = await this.skipToNextBusinessDay(sendTime, prospectTimezone)
    }

    return sendTime.toDate()
  }

  private getOptimalSendHour(canal: string): { hour: number; minute: number } {
    switch (canal) {
      case 'email':
        // Email : mardi-jeudi 8h-10h, pic a 9h
        return { hour: 8 + Math.floor(Math.random() * 2), minute: Math.floor(Math.random() * 30) }
      case 'linkedin_connection':
      case 'linkedin_message':
        // LinkedIn : 9h-11h
        return { hour: 9 + Math.floor(Math.random() * 2), minute: Math.floor(Math.random() * 30) }
      default:
        return { hour: 9, minute: 0 }
    }
  }

  private async getProspectTimezone(input: SuiveurInput): Promise<string> {
    // Si le prospect a une timezone enregistree, l'utiliser
    const prospect = await db.query(
      `SELECT timezone FROM prospects WHERE prospect_id = $1`,
      [input.prospect_id]
    )

    if (prospect.rows[0]?.timezone) {
      return prospect.rows[0].timezone
    }

    // Defaut : France metropolitaine
    return 'Europe/Paris'
  }

  private async skipToNextBusinessDay(
    momentDate: any,
    timezone: string
  ): Promise<any> {
    const holidays = await this.getHolidays(momentDate.year())

    while (true) {
      const dayOfWeek = momentDate.day()
      const dateStr = momentDate.format('YYYY-MM-DD')

      // Pas de weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        momentDate.add(1, 'day')
        continue
      }

      // Pas de jour ferie
      if (holidays.includes(dateStr)) {
        momentDate.add(1, 'day')
        continue
      }

      break
    }

    return momentDate
  }

  private async getHolidays(year: number): Promise<string[]> {
    // Jours feries France metropolitaine
    const fixedHolidays = [
      `${year}-01-01`, // Jour de l'an
      `${year}-05-01`, // Fete du travail
      `${year}-05-08`, // Victoire 1945
      `${year}-07-14`, // Fete nationale
      `${year}-08-15`, // Assomption
      `${year}-11-01`, // Toussaint
      `${year}-11-11`, // Armistice
      `${year}-12-25`, // Noel
    ]

    // Jours feries mobiles (Paques et derives) -- calcul pour 2026
    const easterDates: Record<number, string> = {
      2025: '2025-04-20',
      2026: '2026-04-05',
      2027: '2027-03-28',
      2028: '2028-04-16',
    }

    const easter = easterDates[year]
    if (easter) {
      const easterMoment = require('moment')(easter)
      fixedHolidays.push(
        easterMoment.clone().add(1, 'day').format('YYYY-MM-DD'),  // Lundi de Paques
        easterMoment.clone().add(39, 'days').format('YYYY-MM-DD'), // Ascension
        easterMoment.clone().add(50, 'days').format('YYYY-MM-DD'), // Lundi de Pentecote
      )
    }

    // Jours feries specifiques La Reunion (pour Jonathan)
    const reunionHolidays = [
      `${year}-12-20`, // Abolition de l'esclavage a La Reunion
    ]

    return [...fixedHolidays, ...reunionHolidays]
  }
}
```

#### 3d.3 Gestion timezone La Reunion vs France metro

```typescript
// Jonathan est a La Reunion (UTC+4)
// Prospects principalement en France metro (UTC+1 hiver / UTC+2 ete)
// Decalage : +3h en hiver, +2h en ete

const TIMEZONE_CONFIG = {
  // Base Axiom
  base: 'Indian/Reunion',       // UTC+4 (pas de changement d'heure)

  // Cibles principales
  targets: {
    france_metro: 'Europe/Paris',  // UTC+1 (hiver) / UTC+2 (ete)
    belgique: 'Europe/Brussels',   // UTC+1 / UTC+2
    suisse: 'Europe/Zurich',       // UTC+1 / UTC+2
    luxembourg: 'Europe/Luxembourg', // UTC+1 / UTC+2
    canada_quebec: 'America/Montreal', // UTC-5 / UTC-4
  },

  // Implications operationnelles
  implications: {
    // Quand il est 9h a Paris, il est :
    // - 12h a La Reunion (hiver) ou 11h (ete)
    // Donc Jonathan peut travailler ses matins tranquillement
    // et les emails partent automatiquement a 9h heure prospect

    // Fenetre d'envoi France metro (en heure Reunion) :
    envoi_france_winter: { start_reunion: 12, end_reunion: 15 }, // 9h-12h Paris
    envoi_france_summer: { start_reunion: 11, end_reunion: 14 }, // 9h-12h Paris

    // Notifications de reponses HOT :
    // Si un prospect francais repond a 9h Paris = 12h Reunion
    // Jonathan recoit la notif dans ses heures de travail
    // Si reponse a 17h Paris = 20h Reunion --> notification Slack quand meme
  },
}

// Fonction utilitaire pour calculer l'heure d'envoi dans la timezone du prospect
function getLocalSendTime(
  prospectTimezone: string,
  targetHour: number,
  targetMinute: number = 0
): Date {
  const moment = require('moment-timezone')

  const now = moment.tz(prospectTimezone)
  let sendTime = now.clone().set({ hour: targetHour, minute: targetMinute, second: 0 })

  // Si l'heure est passee aujourd'hui, programmer pour demain
  if (sendTime.isBefore(now)) {
    sendTime.add(1, 'day')
  }

  return sendTime.toDate()
}
```

---

## 4. SEQUENCES COMPLETES PAR SEGMENT

### 4.1 Format JSON de definition d'une sequence

```typescript
interface SequenceDefinition {
  sequence_id: string
  nom: string
  description: string
  categorie_cible: 'HOT' | 'WARM' | 'COLD'
  segment_cible: string
  duree_totale_jours: number
  nombre_etapes: number
  etapes: SequenceStep[]
  conditions_arret: StopCondition[]
}

interface SequenceStep {
  etape_numero: number
  jour: number                // Jour relatif (0 = premier contact)
  canal: 'email' | 'linkedin_connection' | 'linkedin_message' | 'linkedin_visit' | 'linkedin_like'
  action: string              // Description de l'action
  template_id: string         // Reference au template Agent 4
  conditions: StepCondition[] // Conditions pour executer cette etape
  fallback: string | null     // Si la condition n'est pas remplie
  heure_optimale: { min: number; max: number }  // Heure locale prospect
}

interface StepCondition {
  type: 'linkedin_connected' | 'email_opened' | 'no_reply' | 'no_bounce' | 'business_day'
  value: boolean
}

interface StopCondition {
  type: 'reply_received' | 'bounce_hard' | 'opt_out' | 'linkedin_ban' | 'manual_stop'
  action: string
}
```

### 4.2 Sequence 1 : PME France metro (HOT)

```json
{
  "sequence_id": "SEQ_HOT_PME_METRO",
  "nom": "Hot PME Metro - Multicanal Intensif",
  "description": "Sequence intensive pour PME francaises scorees HOT. Duree courte, multicanal.",
  "categorie_cible": "HOT",
  "segment_cible": "pme_metro",
  "duree_totale_jours": 10,
  "nombre_etapes": 6,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_visit",
      "action": "Visite du profil LinkedIn pour creer une notification",
      "template_id": "VISIT_ONLY",
      "conditions": [
        { "type": "business_day", "value": true }
      ],
      "fallback": "reporter_jour_ouvre_suivant",
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 2,
      "jour": 0,
      "canal": "email",
      "action": "Email personnalise premier contact avec donnee d'impact",
      "template_id": "TPL-HOT-001",
      "conditions": [
        { "type": "no_bounce", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 3,
      "jour": 1,
      "canal": "linkedin_connection",
      "action": "Demande de connexion avec note personnalisee",
      "template_id": "TPL-LI-CONN-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 4,
      "jour": 3,
      "canal": "email",
      "action": "Follow-up email avec nouvel angle (social proof)",
      "template_id": "TPL-HOT-002-FOLLOWUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "no_bounce", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 5,
      "canal": "linkedin_message",
      "action": "Message LinkedIn si connecte, sinon skip",
      "template_id": "TPL-LI-MSG-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 6,
      "jour": 10,
      "canal": "email",
      "action": "Email breakup - derniere tentative, ton leger et porte ouverte",
      "template_id": "TPL-HOT-003-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" },
    { "type": "manual_stop", "action": "stop_et_archiver" }
  ]
}
```

### 4.3 Sequence 2 : Startup Tech (HOT)

```json
{
  "sequence_id": "SEQ_HOT_STARTUP_TECH",
  "nom": "Hot Startup Tech - LinkedIn-First",
  "description": "Sequence LinkedIn-first pour startups tech. Decision rapide, canal informel.",
  "categorie_cible": "HOT",
  "segment_cible": "startup_tech",
  "duree_totale_jours": 14,
  "nombre_etapes": 6,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_like",
      "action": "Liker un post recent du prospect",
      "template_id": "LIKE_RECENT_POST",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 14 }
    },
    {
      "etape_numero": 2,
      "jour": 1,
      "canal": "linkedin_connection",
      "action": "Demande connexion avec note tech/startup friendly",
      "template_id": "TPL-LI-CONN-STARTUP-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 3,
      "jour": 3,
      "canal": "linkedin_message",
      "action": "Message LinkedIn personnalise avec donnee d'impact",
      "template_id": "TPL-LI-MSG-STARTUP-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "send_email_instead",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 4,
      "jour": 7,
      "canal": "email",
      "action": "Email premier contact (si LinkedIn n'a pas converti)",
      "template_id": "TPL-HOT-STARTUP-EMAIL-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 10,
      "canal": "email",
      "action": "Follow-up avec case study pertinent",
      "template_id": "TPL-HOT-STARTUP-EMAIL-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 6,
      "jour": 14,
      "canal": "email",
      "action": "Email breakup",
      "template_id": "TPL-HOT-STARTUP-EMAIL-003-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" },
    { "type": "linkedin_ban", "action": "pause_linkedin_continue_email" }
  ]
}
```

### 4.4 Sequence 3 : E-commerce (WARM)

```json
{
  "sequence_id": "SEQ_WARM_ECOMMERCE",
  "nom": "Warm E-commerce - Sequence Standard",
  "description": "Sequence standard 21 jours pour e-commerçants scores WARM.",
  "categorie_cible": "WARM",
  "segment_cible": "ecommerce",
  "duree_totale_jours": 21,
  "nombre_etapes": 5,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "email",
      "action": "Email premier contact avec analyse perf site",
      "template_id": "TPL-WARM-ECOM-001",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 2,
      "jour": 3,
      "canal": "linkedin_connection",
      "action": "Demande connexion LinkedIn",
      "template_id": "TPL-LI-CONN-ECOM-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 3,
      "jour": 7,
      "canal": "email",
      "action": "Follow-up avec social proof e-commerce",
      "template_id": "TPL-WARM-ECOM-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 4,
      "jour": 14,
      "canal": "linkedin_message",
      "action": "Message LinkedIn court si connecte",
      "template_id": "TPL-LI-MSG-ECOM-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "send_email_followup",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 5,
      "jour": 21,
      "canal": "email",
      "action": "Breakup email gracieux",
      "template_id": "TPL-WARM-ECOM-003-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" }
  ]
}
```

### 4.5 Sequence 4 : Services B2B (WARM)

```json
{
  "sequence_id": "SEQ_WARM_SERVICES_B2B",
  "nom": "Warm Services B2B - Approche Consultative",
  "description": "Sequence 28 jours pour entreprises de services B2B. Ton expert, plus de touchpoints.",
  "categorie_cible": "WARM",
  "segment_cible": "services_b2b",
  "duree_totale_jours": 28,
  "nombre_etapes": 7,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_visit",
      "action": "Visite profil LinkedIn",
      "template_id": "VISIT_ONLY",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 2,
      "jour": 1,
      "canal": "email",
      "action": "Email premier contact expert/consultative",
      "template_id": "TPL-WARM-B2B-001",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 3,
      "jour": 3,
      "canal": "linkedin_connection",
      "action": "Demande connexion avec note pro",
      "template_id": "TPL-LI-CONN-B2B-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 4,
      "jour": 7,
      "canal": "email",
      "action": "Follow-up avec contenu educatif (guide, article)",
      "template_id": "TPL-WARM-B2B-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 14,
      "canal": "linkedin_message",
      "action": "Message LinkedIn si connecte",
      "template_id": "TPL-LI-MSG-B2B-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 6,
      "jour": 21,
      "canal": "email",
      "action": "Email case study specifique au secteur",
      "template_id": "TPL-WARM-B2B-003",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 7,
      "jour": 28,
      "canal": "email",
      "action": "Breakup email",
      "template_id": "TPL-WARM-B2B-004-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" }
  ]
}
```

### 4.6 Sequence 5 : Grands Comptes (COLD)

```json
{
  "sequence_id": "SEQ_COLD_GRANDS_COMPTES",
  "nom": "Cold Grands Comptes - Sequence Longue Education",
  "description": "Sequence 45 jours pour grands comptes froids. Approche educative, beaucoup de LinkedIn engagement.",
  "categorie_cible": "COLD",
  "segment_cible": "grands_comptes",
  "duree_totale_jours": 45,
  "nombre_etapes": 8,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_visit",
      "action": "Visite profil LinkedIn",
      "template_id": "VISIT_ONLY",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 2,
      "jour": 1,
      "canal": "linkedin_like",
      "action": "Liker 1-2 posts recents du prospect",
      "template_id": "LIKE_RECENT_POST",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 14 }
    },
    {
      "etape_numero": 3,
      "jour": 3,
      "canal": "linkedin_connection",
      "action": "Demande connexion formelle",
      "template_id": "TPL-LI-CONN-GC-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 4,
      "jour": 7,
      "canal": "email",
      "action": "Email premier contact formel avec donnee sectorielle",
      "template_id": "TPL-COLD-GC-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 14,
      "canal": "email",
      "action": "Email contenu educatif (benchmark secteur, livre blanc)",
      "template_id": "TPL-COLD-GC-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 6,
      "jour": 21,
      "canal": "linkedin_message",
      "action": "Message LinkedIn si connecte (lien vers contenu)",
      "template_id": "TPL-LI-MSG-GC-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 7,
      "jour": 30,
      "canal": "email",
      "action": "Email nouvel angle (actualite secteur ou invite evenement)",
      "template_id": "TPL-COLD-GC-003",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 8,
      "jour": 45,
      "canal": "email",
      "action": "Breakup email gracieux, porte ouverte pour futur",
      "template_id": "TPL-COLD-GC-004-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" }
  ]
}
```

### 4.7 Tableau comparatif des sequences

| Sequence | Segment | Categorie | Duree | Etapes | Emails | LinkedIn | Gap pattern |
|---|---|---|---|---|---|---|---|
| SEQ_HOT_PME_METRO | PME France | HOT | 10j | 6 | 3 | 3 | [0,0,1,3,5,10] |
| SEQ_HOT_STARTUP_TECH | Startup Tech | HOT | 14j | 6 | 3 | 3 | [0,1,3,7,10,14] |
| SEQ_WARM_ECOMMERCE | E-commerce | WARM | 21j | 5 | 3 | 2 | [0,3,7,14,21] |
| SEQ_WARM_SERVICES_B2B | Services B2B | WARM | 28j | 7 | 4 | 3 | [0,1,3,7,14,21,28] |
| SEQ_COLD_GRANDS_COMPTES | Grands comptes | COLD | 45j | 8 | 4 | 4 | [0,1,3,7,14,21,30,45] |

---

## 5. SCHEDULING

### 5.1 Meilleurs horaires par canal (donnees 2025-2026)

#### Email

| Horaire (heure locale prospect) | Open Rate | Reply Rate | Recommandation |
|---|---|---|---|
| 8h00 - 10h00 | 27-28% | 60.58% des reponses | **OPTIMAL** |
| 10h00 - 12h00 | 24-26% | Bon | Acceptable |
| 14h00 - 16h00 | 20-22% | Moyen | Eviter si possible |
| Avant 8h / Apres 18h | < 15% | Faible | Interdit |

**Meilleurs jours :**
1. **Mardi** (27-28% open rate) -- meilleur jour
2. **Jeudi** (25-26%) -- deuxieme meilleur
3. **Mercredi** (17-18%) -- acceptable
4. **Lundi** -- eviter (congestion inbox)
5. **Vendredi** -- eviter (attention basse)
6. **Weekend** -- INTERDIT

#### LinkedIn

| Horaire (heure locale prospect) | Engagement | Recommandation |
|---|---|---|
| 9h00 - 11h00 | Haut | **OPTIMAL** |
| 11h00 - 13h00 | Moyen-haut | Acceptable |
| 14h00 - 16h00 | Moyen | Acceptable pour likes |
| Weekend | Tres faible | INTERDIT |

**Regle critique LinkedIn :** Ne pas envoyer de batch a heure fixe. LinkedIn detecte les patterns reguliers. Toujours randomiser +/- 2h autour de l'horaire cible.

### 5.2 Gestion timezone La Reunion vs France metro

```typescript
const TIMEZONE_RULES = {
  // Decalage La Reunion (UTC+4) vs Paris (UTC+1/+2)
  // Hiver : +3h (quand Paris = 9h, Reunion = 12h)
  // Ete : +2h (quand Paris = 9h, Reunion = 11h)

  planning: {
    // Jonathan peut programmer les envois depuis La Reunion
    // Le systeme envoie automatiquement a l'heure du prospect
    // Exemple : job planifie pour 9h Europe/Paris
    // Le serveur execute a 9h heure Paris, que Jonathan soit eveille ou non

    // Fenetre de notification pour Jonathan (heure Reunion) :
    jonathan_working_hours: {
      start: 8,  // 8h Reunion = 5h Paris (hiver) / 6h Paris (ete)
      end: 20,   // 20h Reunion = 17h Paris (hiver) / 18h Paris (ete)
    },

    // Notification HOT lead : toujours immediate, meme hors heures
    hot_lead_notification: 'always_immediate',
  },
}
```

### 5.3 Throttling

| Canal | Max/heure | Max/jour | Priorite |
|---|---|---|---|
| Email (par adresse) | 10 | 50 | HOT > WARM > COLD |
| Email (total 3 domaines) | 30 | 150 | -- |
| LinkedIn connexions | 5 | 25 | HOT > WARM |
| LinkedIn messages | 15 | 80 | HOT > WARM |
| LinkedIn visites | 30 | 150 | Egalitaire |

#### Priorisation HOT > WARM dans la file d'attente

```typescript
// BullMQ priority : plus le nombre est petit, plus c'est prioritaire
const QUEUE_PRIORITIES = {
  HOT_A: 1,   // Priorite absolue
  HOT_B: 2,
  HOT_C: 3,
  WARM: 5,
  COLD: 10,
}

// Si la file est pleine (quota journalier atteint), les HOT passent d'abord
// Les COLD sont reportes au jour suivant si necessaire
```

### 5.4 Calendrier jours feries France + DOM 2026

```typescript
const JOURS_FERIES_2026: Record<string, string[]> = {
  // France metropolitaine
  france_metro: [
    '2026-01-01',  // Jour de l'an
    '2026-04-06',  // Lundi de Paques
    '2026-05-01',  // Fete du travail
    '2026-05-08',  // Victoire 1945
    '2026-05-14',  // Ascension
    '2026-05-25',  // Lundi de Pentecote
    '2026-07-14',  // Fete nationale
    '2026-08-15',  // Assomption
    '2026-11-01',  // Toussaint
    '2026-11-11',  // Armistice
    '2026-12-25',  // Noel
  ],

  // La Reunion (jours feries supplementaires)
  reunion: [
    // Memes que metro +
    '2026-12-20',  // Abolition de l'esclavage a La Reunion
  ],

  // Periodes a eviter (pas feries mais basse reactivite)
  periodes_creuses: [
    // Vacances de Noel/Nouvel An
    { debut: '2026-12-22', fin: '2027-01-03' },
    // Vacances d'ete
    { debut: '2026-07-15', fin: '2026-08-31' },
    // Pont de l'Ascension
    { debut: '2026-05-13', fin: '2026-05-17' },
  ],
}

// Regle : pas d'envoi les jours feries du pays du prospect
// Regle : reduire le volume de 50% pendant les periodes creuses
```

### 5.5 Weekend : pas d'envoi

```typescript
function isWeekend(date: Date, timezone: string): boolean {
  const moment = require('moment-timezone')
  const m = moment.tz(date, timezone)
  return m.day() === 0 || m.day() === 6 // Dimanche = 0, Samedi = 6
}

// Regle absolue : aucun envoi email ou LinkedIn le weekend
// Les jobs planifies un weekend sont automatiquement decales au lundi suivant
```

---

## 6. DETECTION DES REPONSES

### 6.1 Gmail API Watch : setup exact

#### Prerequis Google Cloud Platform

```
1. Creer un projet GCP : "axiom-prospection"
2. Activer l'API Gmail
3. Activer Cloud Pub/Sub
4. Creer un topic Pub/Sub : "gmail-axiom-replies"
5. Creer un abonnement push : "gmail-axiom-replies-sub"
   - Endpoint : https://api.axiom-marketing.fr/webhooks/gmail-pubsub
6. Donner au service account Gmail les permissions publish sur le topic
7. Creer les credentials OAuth2 (type : Web application)
8. Obtenir le refresh_token via le flow OAuth2 consent
```

#### Setup complet

```typescript
// 1. Initialisation Gmail Watch
async function initGmailWatch(): Promise<void> {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

  const gmail = google.gmail({ version: 'v1', auth })

  // Setup watch
  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: `projects/${process.env.GCP_PROJECT_ID}/topics/gmail-axiom-replies`,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    },
  })

  console.log(`Gmail Watch active. Expire: ${new Date(Number(response.data.expiration))}`)
}

// 2. Webhook handler (Express)
app.post('/webhooks/gmail-pubsub', async (req, res) => {
  const message = req.body.message
  if (!message) return res.status(400).send('No message')

  const data = JSON.parse(Buffer.from(message.data, 'base64').toString())

  // Traiter la notification
  await gmailWatcher.handlePubSubNotification({
    data: message.data,
    ack: () => res.status(200).send('OK'),
  })

  res.status(200).send('OK')
})

// 3. Cron de renouvellement du watch (tous les 6 jours)
// Le watch expire apres 7 jours
cron.schedule('0 6 */6 * *', async () => {
  await initGmailWatch()
  console.log('[Agent5c] Gmail Watch renouvele')
})
```

### 6.2 Classification Claude : prompt complet avec categories

Le prompt complet est defini dans la section 3c.5 (propriete `SYSTEM_PROMPT` de la classe `ReplyClassifier`).

**Resume des categories et actions :**

| Categorie | Action automatique | Notification | SLA |
|---|---|---|---|
| INTERESSE | Arreter sequence, creer tache call | Slack URGENT + email + SMS | < 5 min |
| INTERESSE_SOFT | Pauser sequence | Slack HIGH | < 1h |
| PAS_MAINTENANT | Arreter sequence, planifier reprise 30j | Aucune | -- |
| PAS_INTERESSE | Arreter sequence, supprimer prospect | Aucune | -- |
| MAUVAISE_PERSONNE | Arreter sequence, creer lead refere | Slack MEDIUM | < 8h |
| DEMANDE_INFO | Pauser sequence | Slack MEDIUM | < 8h |
| OUT_OF_OFFICE | Pauser sequence, reprendre apres retour | Aucune | -- |
| SPAM | Archiver | Aucune | -- |

### 6.3 Exemples detailles de reponses et classification attendue

```typescript
const CLASSIFICATION_EXAMPLES = [
  // === INTERESSE ===
  {
    reponse: "Bonjour Jonathan, merci pour votre message. Effectivement nous sommes en pleine reflexion sur notre strategie digitale. Est-ce qu'on pourrait se caler un call de 30 min la semaine prochaine ?",
    classification: {
      category: "INTERESSE",
      confidence: 0.97,
      sentiment: "positif",
      action_suggeree: "Proposer 2-3 creneaux pour un call la semaine prochaine",
      phrase_cle: "Est-ce qu'on pourrait se caler un call de 30 min"
    }
  },
  {
    reponse: "Yes, let's discuss. Are you free Thursday?",
    classification: {
      category: "INTERESSE",
      confidence: 0.96,
      sentiment: "positif",
      action_suggeree: "Confirmer disponibilite jeudi, proposer horaire",
      phrase_cle: "let's discuss"
    }
  },

  // === INTERESSE_SOFT ===
  {
    reponse: "Interessant. Vous avez une plaquette ou un deck avec vos offres et tarifs ?",
    classification: {
      category: "INTERESSE_SOFT",
      confidence: 0.89,
      sentiment: "positif",
      action_suggeree: "Envoyer plaquette commerciale + proposer un echange",
      phrase_cle: "Vous avez une plaquette ou un deck avec vos offres"
    }
  },

  // === PAS_MAINTENANT ===
  {
    reponse: "Merci pour la proposition. Le sujet nous parle mais nous venons de contractualiser avec une agence pour 12 mois. Recontactez-moi en janvier 2027.",
    classification: {
      category: "PAS_MAINTENANT",
      confidence: 0.94,
      sentiment: "neutre",
      action_suggeree: "Reporter la prise de contact a janvier 2027",
      date_retour_ooo: "2027-01-05",
      phrase_cle: "Recontactez-moi en janvier 2027"
    }
  },

  // === PAS_INTERESSE ===
  {
    reponse: "Bonjour, je ne suis pas interesse par ce type de prestation. Merci de ne plus me contacter.",
    classification: {
      category: "PAS_INTERESSE",
      confidence: 0.95,
      sentiment: "negatif",
      action_suggeree: "Supprimer le prospect, respecter la demande",
      phrase_cle: "Merci de ne plus me contacter"
    }
  },

  // === MAUVAISE_PERSONNE ===
  {
    reponse: "Bonjour, je ne suis plus responsable du marketing. C'est maintenant Sophie Martin qui gere ce sujet. Vous pouvez la joindre a s.martin@company.fr",
    classification: {
      category: "MAUVAISE_PERSONNE",
      confidence: 0.96,
      sentiment: "neutre",
      action_suggeree: "Creer un lead pour Sophie Martin (s.martin@company.fr)",
      personne_referree: {
        nom: "Sophie Martin",
        email: "s.martin@company.fr",
        poste: "Responsable marketing"
      },
      phrase_cle: "C'est maintenant Sophie Martin qui gere ce sujet"
    }
  },

  // === DEMANDE_INFO ===
  {
    reponse: "Quels sont vos tarifs pour un audit SEO complet ? Et est-ce que vous avez des references dans le secteur pharma ?",
    classification: {
      category: "DEMANDE_INFO",
      confidence: 0.91,
      sentiment: "neutre",
      action_suggeree: "Repondre avec grille tarifaire audit SEO + references pharma",
      phrase_cle: "Quels sont vos tarifs pour un audit SEO complet"
    }
  },

  // === OUT_OF_OFFICE ===
  {
    reponse: "Merci pour votre message. Je suis actuellement en conge et de retour le 25 mars 2026. Pour les urgences, contactez mon collegue Pierre Duval a p.duval@company.fr. Cordialement.",
    classification: {
      category: "OUT_OF_OFFICE",
      confidence: 0.99,
      sentiment: "neutre",
      action_suggeree: "Pauser la sequence, reprendre le 27 mars 2026",
      date_retour_ooo: "2026-03-25",
      phrase_cle: "de retour le 25 mars 2026"
    }
  },

  // === SPAM ===
  {
    reponse: "RE: Offre speciale - Profitez de -40% sur tous nos logiciels CRM ce mois-ci ! Cliquez ici pour en beneficier.",
    classification: {
      category: "SPAM",
      confidence: 0.98,
      sentiment: "neutre",
      action_suggeree: "Ignorer, archiver",
      phrase_cle: "Offre speciale - Profitez de -40%"
    }
  },
]
```

---

## 7. NOTIFICATIONS

### 7.1 Slack API : setup webhook et format

#### Setup Slack App

```
1. Creer une Slack App sur api.slack.com/apps
   Nom : "Axiom Prospection Bot"

2. Configurer les permissions (Bot Token Scopes) :
   - chat:write
   - chat:write.customize
   - channels:read
   - groups:read
   - im:write
   - incoming-webhook
   - users:read

3. Creer les channels :
   - #sales-hot-leads       (notifications URGENT/HIGH)
   - #sales-pipeline        (notifications MEDIUM)
   - #sales-alerts          (erreurs techniques, restrictions)
   - #sales-daily-digest    (resume quotidien automatique)

4. Installer le bot dans le workspace

5. Recuperer le Bot Token : xoxb-XXXX
6. Recuperer le Webhook URL pour chaque channel
```

#### Configuration

```typescript
const SLACK_CONFIG = {
  bot_token: process.env.SLACK_BOT_TOKEN,

  channels: {
    hot_leads: '#sales-hot-leads',
    pipeline: '#sales-pipeline',
    alerts: '#sales-alerts',
    daily_digest: '#sales-daily-digest',
    jonathan_dm: process.env.SLACK_JONATHAN_DM_CHANNEL, // DM direct a Jonathan
  },

  notification_routing: {
    INTERESSE: ['hot_leads', 'jonathan_dm'],
    INTERESSE_SOFT: ['hot_leads'],
    DEMANDE_INFO: ['pipeline'],
    MAUVAISE_PERSONNE: ['pipeline'],
    ERREUR_TECHNIQUE: ['alerts'],
    LINKEDIN_BAN: ['alerts', 'jonathan_dm'],
    BOUNCE_RATE_HIGH: ['alerts'],
    SLA_BREACH: ['alerts', 'jonathan_dm'],
  },
}
```

### 7.2 Quand notifier

| Evenement | Canal Slack | Priorite | Delai max | Format |
|---|---|---|---|---|
| Reponse positive (INTERESSE) | #sales-hot-leads + DM Jonathan | URGENT | < 5 min | Message interactif avec boutons |
| Reponse soft interest | #sales-hot-leads | HIGH | < 1h | Message avec preview |
| Demande d'info | #sales-pipeline | MEDIUM | < 8h | Message simple |
| Personne referree | #sales-pipeline | MEDIUM | < 8h | Message avec lien |
| Bounce rate > 3% sur un domaine | #sales-alerts | HIGH | Immediat | Alerte avec stats |
| LinkedIn restriction detectee | #sales-alerts + DM Jonathan | HIGH | Immediat | Alerte avec recovery plan |
| SLA breache (reponse HOT non traitee > 1h) | #sales-alerts + DM Jonathan | URGENT | Immediat | Escalade |
| Resume quotidien | #sales-daily-digest | LOW | 18h Reunion | Rapport |

### 7.3 Template de notification avec boutons Slack

```typescript
import { WebClient } from '@slack/web-api'

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

interface NotificationPayload {
  type: string
  prospect_id: string
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  reply_snippet: string
  full_reply?: string
  action?: string
  sla_minutes?: number
}

async function notifyJonathan(payload: NotificationPayload): Promise<void> {
  const prospect = await db.query(
    `SELECT p.*, rc.category, rc.confidence, rc.sentiment
     FROM prospects p
     LEFT JOIN reply_classifications rc ON rc.prospect_id = p.prospect_id
     WHERE p.prospect_id = $1
     ORDER BY rc.classified_at DESC LIMIT 1`,
    [payload.prospect_id]
  )
  const p = prospect.rows[0]

  // Determiner les channels
  const channels = SLACK_CONFIG.notification_routing[payload.type as keyof typeof SLACK_CONFIG.notification_routing] || ['pipeline']
  const channelIds = channels.map(c => SLACK_CONFIG.channels[c as keyof typeof SLACK_CONFIG.channels])

  // Construire le message Slack avec Block Kit
  const blocks = buildNotificationBlocks(payload, p)

  for (const channel of channelIds) {
    await slack.chat.postMessage({
      channel,
      text: `${getPriorityEmoji(payload.priority)} ${payload.type}: ${p.prenom} ${p.nom} @ ${p.entreprise_nom}`,
      blocks,
    })
  }

  // Enregistrer la notification
  await db.query(`
    INSERT INTO notifications (
      prospect_id, type, priority, channels, message_preview,
      sla_deadline, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [
    payload.prospect_id, payload.type, payload.priority,
    JSON.stringify(channelIds), payload.reply_snippet,
    payload.sla_minutes ? new Date(Date.now() + payload.sla_minutes * 60000).toISOString() : null,
  ])
}

function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case 'URGENT': return 'URGENT'
    case 'HIGH': return 'IMPORTANT'
    case 'MEDIUM': return 'INFO'
    case 'LOW': return 'NOTE'
    default: return ''
  }
}

function buildNotificationBlocks(payload: NotificationPayload, prospect: any): any[] {
  const blocks: any[] = []

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${payload.priority} - ${payload.type}`,
    },
  })

  // Info prospect
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${prospect.prenom} ${prospect.nom}* - ${prospect.poste}\n*${prospect.entreprise_nom}*\nScore: *${prospect.score_total}* (${prospect.categorie})`,
    },
  })

  // Citation de la reponse
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `> ${payload.reply_snippet}`,
    },
  })

  // Action suggeree
  if (payload.action) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Action suggeree :* ${payload.action}`,
      },
    })
  }

  // SLA
  if (payload.sla_minutes) {
    const deadline = new Date(Date.now() + payload.sla_minutes * 60000)
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `SLA : repondre avant ${deadline.toLocaleTimeString('fr-FR')} (dans ${payload.sla_minutes} min)`,
      }],
    })
  }

  // Boutons d'action
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Voir email complet' },
        url: `${process.env.APP_URL}/prospects/${payload.prospect_id}/replies`,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Repondre maintenant' },
        action_id: 'reply_to_prospect',
        value: payload.prospect_id,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Reporter (3j)' },
        action_id: 'snooze_prospect',
        value: `${payload.prospect_id}_3`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Ignorer' },
        action_id: 'dismiss_notification',
        value: payload.prospect_id,
      },
    ],
  })

  return blocks
}

// Handler des interactions Slack (boutons)
app.post('/webhooks/slack-interactions', async (req, res) => {
  const payload = JSON.parse(req.body.payload)
  const action = payload.actions[0]

  switch (action.action_id) {
    case 'reply_to_prospect':
      // Ouvrir un modal Slack pour composer la reponse
      await slack.views.open({
        trigger_id: payload.trigger_id,
        view: buildReplyModal(action.value),
      })
      break

    case 'snooze_prospect':
      const [prospectId, days] = action.value.split('_')
      await snoozeProspect(prospectId, parseInt(days))
      await slack.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        text: `Prospect reporte de ${days} jours`,
      })
      break

    case 'dismiss_notification':
      await db.query(
        `UPDATE notifications SET read_at = NOW() WHERE prospect_id = $1 AND read_at IS NULL`,
        [action.value]
      )
      break
  }

  res.status(200).send('')
})
```

### 7.4 SLA : HOT reponse = notifier en < 5 min

```typescript
class SLAMonitor {
  // Verification toutes les minutes
  async checkSLABreaches(): Promise<void> {
    // Trouver les reponses non traitees qui depassent leur SLA
    const breaches = await db.query(`
      SELECT rc.*, p.prenom, p.nom, p.entreprise_nom, n.sla_deadline
      FROM reply_classifications rc
      JOIN prospects p ON rc.prospect_id = p.prospect_id
      LEFT JOIN notifications n ON n.prospect_id = rc.prospect_id
      WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT', 'DEMANDE_INFO')
      AND rc.handled = false
      AND n.sla_deadline IS NOT NULL
      AND n.sla_deadline < NOW()
      AND n.escalated = false
    `)

    for (const breach of breaches.rows) {
      await this.escalate(breach)
    }
  }

  private async escalate(breach: any): Promise<void> {
    // Envoyer un message d'escalade
    await slack.chat.postMessage({
      channel: SLACK_CONFIG.channels.jonathan_dm,
      text: `SLA DEPASSE : ${breach.prenom} ${breach.nom} (${breach.entreprise_nom}) a repondu avec interet il y a plus de ${this.getTimeSince(breach.classified_at)}. Action requise immediatement.`,
    })

    // Marquer comme escalade
    await db.query(
      `UPDATE notifications SET escalated = true, escalated_at = NOW()
       WHERE prospect_id = $1 AND escalated = false`,
      [breach.prospect_id]
    )

    // Si SLA > 2x, envoyer aussi par email
    const slaMultiple = (Date.now() - new Date(breach.sla_deadline).getTime()) / (breach.sla_minutes * 60000)
    if (slaMultiple > 2) {
      await sendEscalationEmail(breach)
    }
  }

  private getTimeSince(date: string): string {
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    return `${hours}h${minutes % 60}min`
  }
}

// Cron : verifier les SLA toutes les minutes
cron.schedule('* * * * *', async () => {
  await slaMonitor.checkSLABreaches()
})
```

### 7.5 Resume quotidien

```typescript
async function sendDailyDigest(): Promise<void> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stats = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'SENT' AND sent_at >= $1) as emails_envoyes,
      COUNT(*) FILTER (WHERE canal = 'linkedin' AND sent_at >= $1) as linkedin_actions,
      COUNT(DISTINCT prospect_id) FILTER (WHERE sent_at >= $1) as prospects_contactes
    FROM email_sends
    WHERE sent_at >= $1
  `, [today.toISOString()])

  const replies = await db.query(`
    SELECT category, COUNT(*) as count
    FROM reply_classifications
    WHERE classified_at >= $1
    GROUP BY category
  `, [today.toISOString()])

  const pendingReplies = await db.query(`
    SELECT COUNT(*) as count FROM reply_classifications
    WHERE handled = false
  `)

  const s = stats.rows[0]
  const replyBreakdown = replies.rows.map((r: any) => `  - ${r.category}: ${r.count}`).join('\n')

  await slack.chat.postMessage({
    channel: SLACK_CONFIG.channels.daily_digest,
    text: 'Resume quotidien prospection',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Resume Prospection - ${today.toLocaleDateString('fr-FR')}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Emails envoyes*\n${s.emails_envoyes}` },
          { type: 'mrkdwn', text: `*Actions LinkedIn*\n${s.linkedin_actions}` },
          { type: 'mrkdwn', text: `*Prospects contactes*\n${s.prospects_contactes}` },
          { type: 'mrkdwn', text: `*Reponses non traitees*\n${pendingReplies.rows[0].count}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reponses recues aujourd'hui :*\n${replyBreakdown || '  Aucune reponse'}`,
        },
      },
    ],
  })
}

// Cron : resume quotidien a 18h heure Reunion (14h Paris en hiver)
cron.schedule('0 18 * * 1-5', sendDailyDigest) // Lundi-vendredi seulement
```

---

## 8. GESTION DES ERREURS

### 8.1 Bounce email (hard/soft)

| Type | Codes SMTP | Exemples | Action automatique |
|---|---|---|---|
| **Hard bounce** | 550, 551, 552, 553 | Adresse invalide, domaine inexistant | Supprimer prospect immediatement, annuler toute la sequence |
| **Soft bounce** | 450, 451, 452, 421 | Boite pleine, serveur occupe | Retry 3x avec backoff (1min, 10min, 1h), puis supprimer |
| **Block** | 421, 450 (niveau ISP) | Reputation IP/domaine | Pause le domaine concerne, switch vers autre domaine |

**Seuils critiques :**
- Bounce rate > 3% sur un domaine --> **pause immediate** du domaine
- Bounce rate > 5% global --> **pause TOUS les envois** + investigation
- Spam complaint > 0.3% --> **pause immediate** + warmdown

```typescript
// Monitoring temps reel des bounces
async function monitorBounceRate(): Promise<void> {
  const domains = Object.keys(DOMAIN_THROTTLE_CONFIG)

  for (const domain of domains) {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
        COUNT(*) FILTER (WHERE status = 'SPAM_COMPLAINT') as spam
      FROM email_sends
      WHERE domaine_envoi = $1
      AND sent_at >= NOW() - INTERVAL '24 hours'
    `, [domain])

    const { total, bounced, spam } = stats.rows[0]
    if (total === 0) continue

    const bounceRate = bounced / total
    const spamRate = spam / total

    if (bounceRate > 0.03) {
      await pauseDomain(domain, 'BOUNCE_RATE_HIGH', bounceRate)
      await notifyJonathan({
        type: 'ERREUR_TECHNIQUE',
        prospect_id: 'SYSTEM',
        priority: 'HIGH',
        reply_snippet: `Domaine ${domain} en pause : bounce rate ${(bounceRate * 100).toFixed(1)}% (seuil: 3%)`,
        action: 'Verifier les adresses et la configuration DNS',
      })
    }

    if (spamRate > 0.003) {
      await pauseDomain(domain, 'SPAM_RATE_HIGH', spamRate)
      await notifyJonathan({
        type: 'ERREUR_TECHNIQUE',
        prospect_id: 'SYSTEM',
        priority: 'URGENT',
        reply_snippet: `ALERTE SPAM : domaine ${domain} a ${(spamRate * 100).toFixed(2)}% de plaintes spam (seuil: 0.3%)`,
        action: 'Arreter les envois, investiguer le contenu et la liste',
      })
    }
  }
}

// Cron toutes les 30 minutes
cron.schedule('*/30 * * * *', monitorBounceRate)
```

### 8.2 LinkedIn ban -- detection + pause + recovery

Voir section 3b.5 pour les signaux de detection et le plan de recovery.

```typescript
// Detection automatique via metriques
async function detectLinkedInRestriction(): Promise<void> {
  // Signal 1 : Taux d'acceptation des connexions en chute
  const acceptanceRate = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'ACCEPTED')::float /
      NULLIF(COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'PENDING', 'REJECTED')), 0) as rate
    FROM linkedin_actions
    WHERE action_type = 'connection_request'
    AND created_at >= NOW() - INTERVAL '7 days'
  `)

  if (acceptanceRate.rows[0]?.rate < 0.15) {
    // Taux d'acceptation tres bas = probable restriction
    await triggerLinkedInRecovery('LOW_ACCEPTANCE_RATE')
  }

  // Signal 2 : Taux d'echec des actions en hausse
  const failRate = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'FAILED')::float /
      NULLIF(COUNT(*), 0) as rate
    FROM linkedin_actions
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `)

  if (failRate.rows[0]?.rate > 0.2) {
    await triggerLinkedInRecovery('HIGH_FAIL_RATE')
  }
}

async function triggerLinkedInRecovery(reason: string): Promise<void> {
  // 1. Arreter toute automation LinkedIn
  await db.query(
    `UPDATE linkedin_actions SET status = 'CANCELLED' WHERE status = 'PENDING'`
  )

  // 2. Notifier
  await notifyJonathan({
    type: 'LINKEDIN_BAN',
    prospect_id: 'SYSTEM',
    priority: 'HIGH',
    reply_snippet: `Restriction LinkedIn detectee (${reason}). Toute automation LinkedIn arretee.`,
    action: 'Voir le plan de recovery dans les specs Agent 5',
  })

  // 3. Planifier la reprise progressive
  // Jour 1-2 : rien
  // Jour 3-7 : activites manuelles seulement (5-10/jour)
  // Jour 8-14 : connexions 5/jour, messages 10/jour
  // Jour 15+ : augmentation progressive
  await db.query(`
    INSERT INTO linkedin_recovery_plans (
      reason, detected_at, phase, status
    ) VALUES ($1, NOW(), 'IMMEDIATE_STOP', 'ACTIVE')
  `, [reason])
}

// Cron toutes les 2 heures
cron.schedule('0 */2 * * *', detectLinkedInRestriction)
```

### 8.3 API down -- retry exponential backoff

```typescript
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelayMs?: number
    maxDelayMs?: number
    retryableStatuses?: number[]
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    retryableStatuses = [429, 500, 502, 503, 504],
  } = options

  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Ne pas retry les erreurs client (sauf 429 rate limit)
      if (error.status && !retryableStatuses.includes(error.status)) {
        throw error
      }

      if (attempt === maxRetries) break

      // Backoff exponentiel avec jitter
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      )

      console.warn(`[Agent5] Retry ${attempt + 1}/${maxRetries} apres ${delay}ms: ${error.message}`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

// Utilisation
const result = await withExponentialBackoff(
  () => sendEmailViaMailgun(input),
  { maxRetries: 3, initialDelayMs: 2000 }
)
```

### 8.4 Doublon d'envoi -- prevention idempotency key

```typescript
// Chaque envoi a une cle d'idempotence unique
// Format : {message_id}_{etape_numero}
// Stockee en base avant l'envoi, verifiee avant chaque tentative

async function ensureIdempotency(messageId: string, etape: number): Promise<boolean> {
  const key = `${messageId}_${etape}`

  // Tentative d'insertion atomique (UNIQUE constraint)
  try {
    await db.query(
      `INSERT INTO idempotency_keys (key, created_at) VALUES ($1, NOW())`,
      [key]
    )
    return true // Pas de doublon, on peut envoyer
  } catch (error: any) {
    if (error.code === '23505') {
      // Violation UNIQUE = doublon detecte
      console.warn(`[Agent5] Doublon detecte pour ${key}, skip`)
      return false
    }
    throw error
  }
}

// Table SQL
// CREATE TABLE idempotency_keys (
//   key VARCHAR(200) PRIMARY KEY,
//   created_at TIMESTAMP NOT NULL DEFAULT NOW()
// );
// CREATE INDEX idx_idempotency_created ON idempotency_keys (created_at);
// -- Nettoyage automatique des cles > 60 jours
```

### 8.5 Prospect repond entre deux etapes -- arret immediat

Le mecanisme est integre dans le sous-agent 5c (Detecteur de Reponses). A chaque reponse detectee :

1. La sequence est immediatement stoppee ou pausee selon la categorie
2. Tous les jobs BullMQ en attente pour ce prospect sont supprimes
3. Le statut du prospect est mis a jour en base

```typescript
// Avant chaque envoi, verifier qu'aucune reponse n'est arrivee depuis la planification du job
async function preflightCheck(prospectId: string, sequenceId: string): Promise<boolean> {
  const recentReply = await db.query(`
    SELECT COUNT(*) as count FROM reply_classifications
    WHERE prospect_id = $1
    AND classified_at >= (
      SELECT started_at FROM prospect_sequences
      WHERE prospect_id = $1 AND sequence_id = $2
    )
  `, [prospectId, sequenceId])

  if (recentReply.rows[0].count > 0) {
    console.warn(`[Agent5] Prospect ${prospectId} a repondu, annulation de l'envoi`)
    return false
  }

  // Verifier aussi le statut du prospect
  const status = await db.query(
    `SELECT status FROM prospects WHERE prospect_id = $1`,
    [prospectId]
  )

  if (['SUPPRESSED', 'OPTED_OUT', 'EXCLUDED', 'INTERESTED'].includes(status.rows[0]?.status)) {
    return false
  }

  return true
}
```

### 8.6 Opt-out -- suppression RGPD immediate

```typescript
async function handleOptOut(prospectId: string, source: 'email_reply' | 'unsubscribe_link' | 'manual'): Promise<void> {
  // 1. Arreter TOUTES les sequences immediatement
  await db.query(
    `UPDATE prospect_sequences SET status = 'STOPPED', stopped_reason = 'OPT_OUT'
     WHERE prospect_id = $1 AND status IN ('ACTIVE', 'PAUSED')`,
    [prospectId]
  )

  // 2. Annuler tous les jobs en attente
  const pendingJobs = await suiveurQueue.getJobs(['delayed', 'waiting'])
  for (const job of pendingJobs) {
    if (job.data.prospect_id === prospectId) {
      await job.remove()
    }
  }

  // 3. Marquer le prospect comme opt-out
  await db.query(
    `UPDATE prospects SET status = 'OPTED_OUT', opted_out_at = NOW(),
     opted_out_source = $1 WHERE prospect_id = $2`,
    [source, prospectId]
  )

  // 4. Logger pour conformite RGPD
  await db.query(`
    INSERT INTO rgpd_events (
      prospect_id, event_type, source, data_affected, created_at
    ) VALUES ($1, 'OPT_OUT', $2, $3, NOW())
  `, [
    prospectId, source,
    JSON.stringify(['email_sequences', 'linkedin_automation', 'notifications']),
  ])

  // 5. Si demande de suppression complete (droit a l'effacement RGPD)
  // A faire sur demande explicite uniquement
  // await deleteProspectData(prospectId)

  console.log(`[Agent5] Prospect ${prospectId} opt-out traite (source: ${source})`)
}

// Suppression complete des donnees (droit a l'effacement)
async function deleteProspectData(prospectId: string): Promise<void> {
  // Attention : conserver un log minimal pour prouver la suppression

  // 1. Supprimer les emails envoyes (corps uniquement, garder les metadata)
  await db.query(
    `UPDATE email_sends SET body_preview = '[SUPPRIME RGPD]', subject_line = '[SUPPRIME RGPD]'
     WHERE prospect_id = $1`,
    [prospectId]
  )

  // 2. Supprimer les reponses
  await db.query(
    `UPDATE reply_classifications SET email_body = '[SUPPRIME RGPD]'
     WHERE prospect_id = $1`,
    [prospectId]
  )

  // 3. Anonymiser les donnees prospect
  await db.query(`
    UPDATE prospects SET
      email = '[SUPPRIME]', prenom = '[SUPPRIME]', nom = '[SUPPRIME]',
      linkedin_url = NULL, poste = '[SUPPRIME]'
    WHERE prospect_id = $1
  `, [prospectId])

  // 4. Logger la suppression
  await db.query(`
    INSERT INTO rgpd_events (
      prospect_id, event_type, source, data_affected, created_at
    ) VALUES ($1, 'DATA_DELETION', 'rgpd_right_to_erasure', $2, NOW())
  `, [prospectId, JSON.stringify(['email', 'prenom', 'nom', 'linkedin_url', 'poste', 'email_bodies', 'reply_bodies'])])
}
```

---

## 9. DOMAIN WARMING PLAN

### 9.1 Strategie multi-domaines

```
3 domaines :
1. axiom-marketing.fr    (existant)
2. axiom-agency.com      (a acheter)
3. axiom-growth.fr       (a acheter)

Pour chaque domaine :
  - 2 adresses email : jonathan@ + contact@
  - Configuration SPF/DKIM/DMARC individuelle
  - Warmup individuel de 5 semaines
```

### 9.2 Plan jour par jour (Semaines 1 a 6)

#### Domaine 1 : axiom-marketing.fr (existant, deja partiellement warme)

| Jour | Volume/adresse | Destinataires | Objectif | Monitoring |
|---|---|---|---|---|
| **Sem 1, J1-J3** | 5/jour | Contacts internes, clients | 0 bounce | Gmail Postmaster Tools |
| **Sem 1, J4-J7** | 10/jour | Contacts internes + collegues | 0 bounce, 0 spam | Verifier inbox placement |
| **Sem 2, J8-J10** | 15/jour | Contacts tièdes | Open rate > 40% | Mailreach seed test |
| **Sem 2, J11-J14** | 25/jour | Mix tiede + semi-froid | Open rate > 30% | Seed test quotidien |
| **Sem 3, J15-J18** | 35/jour | Prospects semi-froids | Open rate > 25% | Bounce rate < 1% |
| **Sem 3, J19-J21** | 45/jour | Prospects froids (qualifies) | Inbox > 80% | Verifier onglet Promotions |
| **Sem 4, J22-J28** | 50/jour (MAX) | Campagne froide | Maintenir metriques | Si chute -> PAUSE |
| **Sem 5+** | 50/jour stable | Campagne froide continue | Stable | Monitoring continu |

#### Domaine 2 : axiom-agency.com (nouveau)

| Jour | Volume/adresse | Destinataires | Objectif | Monitoring |
|---|---|---|---|---|
| **Sem 0** | 0 | -- | Achat domaine, config DNS, attendre 48h propagation | DNS checker |
| **Sem 1, J1-J3** | 3/jour | Contacts personnels uniquement | 0 bounce | SPF/DKIM valides |
| **Sem 1, J4-J7** | 5-8/jour | Contacts internes | 0 bounce, 0 spam | Gmail Postmaster |
| **Sem 2, J8-J14** | 10-20/jour | Contacts tiedes | Open rate > 40% | Seed test |
| **Sem 3, J15-J21** | 20-35/jour | Mix tiede + froid | Open rate > 30% | Bounce < 1% |
| **Sem 4, J22-J28** | 35-50/jour | Prospection froide | Inbox > 80% | Monitoring quotidien |
| **Sem 5, J29-J35** | 50/jour (MAX) | Normal | Stable | Monitoring continu |
| **Sem 6+** | 50/jour stable | Normal | -- | -- |

#### Domaine 3 : axiom-growth.fr (nouveau)

Meme plan que Domaine 2, decale de 1 semaine pour ne pas surcharger les tests initiaux.

### 9.3 Configuration DNS pour chaque domaine

```
POUR CHAQUE DOMAINE :

1. SPF :
   TXT @ v=spf1 include:_spf.google.com include:mailgun.org ~all
   (passer en -all apres 48h sans erreur)

2. DKIM :
   Genere par Google Workspace ou Mailgun
   CNAME : google._domainkey.{domaine} -> ...

3. DMARC :
   Semaine 1 : TXT _dmarc v=DMARC1; p=none; rua=mailto:dmarc@{domaine}
   Semaine 2 : TXT _dmarc v=DMARC1; p=quarantine; rua=mailto:dmarc@{domaine}
   Semaine 3+: TXT _dmarc v=DMARC1; p=reject; rua=mailto:dmarc@{domaine}
```

### 9.4 Outils de warmup

```typescript
// Option 1 : Mailreach (recommande pour MVP)
// 20-25 EUR/mois par adresse
// Setup automatique, rapports de delivrabilite

// Option 2 : Script interne de warmup
class InHouseWarmer {
  private warmingAddresses: string[] // Adresses internes qui repondent aux emails

  async warmDay(domaine: string, dayNumber: number): Promise<void> {
    const volume = this.getVolumeForDay(dayNumber)

    for (let i = 0; i < volume; i++) {
      const recipient = this.warmingAddresses[i % this.warmingAddresses.length]

      await sendEmail({
        from: `jonathan@${domaine}`,
        to: recipient,
        subject: this.generateNaturalSubject(),
        body: this.generateNaturalBody(),
      })

      // Delai aleatoire entre chaque envoi (2-10 minutes)
      const delay = (2 + Math.random() * 8) * 60 * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  private getVolumeForDay(day: number): number {
    if (day <= 3) return 5
    if (day <= 7) return 10
    if (day <= 14) return 20
    if (day <= 21) return 35
    if (day <= 28) return 45
    return 50
  }

  private generateNaturalSubject(): string {
    const subjects = [
      'Re: Question rapide',
      'Suite de notre discussion',
      'Point sur le projet',
      'Disponibilite cette semaine ?',
      'Retour sur la proposition',
      'Info complementaire',
    ]
    return subjects[Math.floor(Math.random() * subjects.length)]
  }

  private generateNaturalBody(): string {
    const bodies = [
      'Bonjour,\n\nJe reviens vers toi concernant notre echange de la semaine derniere.\nAs-tu eu le temps de regarder les documents ?\n\nMerci,\nJonathan',
      'Salut,\n\nPetite question : est-ce que tu serais disponible jeudi pour un point rapide ?\n\nA bientot,\nJonathan',
      'Hello,\n\nJe te transfère les infos demandees.\nN\'hesite pas si tu as des questions.\n\nBonne journee,\nJonathan',
    ]
    return bodies[Math.floor(Math.random() * bodies.length)]
  }
}
```

### 9.5 Monitoring de sante des domaines

```typescript
// Dashboard temps reel par domaine
interface DomainHealth {
  domaine: string
  status: 'HEALTHY' | 'WARNING' | 'PAUSED' | 'WARMING'
  emails_sent_today: number
  emails_sent_7days: number
  bounce_rate_24h: number
  bounce_rate_7days: number
  spam_rate_24h: number
  open_rate_7days: number
  inbox_placement_pct: number // Via seed tests
  warmup_day: number | null
}

async function getDomainHealthDashboard(): Promise<DomainHealth[]> {
  const domains = Object.keys(DOMAIN_THROTTLE_CONFIG)
  const results: DomainHealth[] = []

  for (const domaine of domains) {
    const stats24h = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
        COUNT(*) FILTER (WHERE status = 'SPAM_COMPLAINT') as spam
      FROM email_sends WHERE domaine_envoi = $1 AND sent_at >= NOW() - INTERVAL '24 hours'
    `, [domaine])

    const stats7d = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
        COUNT(*) FILTER (WHERE opened = true')::float / NULLIF(COUNT(*), 0) as open_rate
      FROM email_sends WHERE domaine_envoi = $1 AND sent_at >= NOW() - INTERVAL '7 days'
    `, [domaine])

    const s24 = stats24h.rows[0]
    const s7d = stats7d.rows[0]

    const bounceRate24h = s24.total > 0 ? s24.bounced / s24.total : 0
    const spamRate24h = s24.total > 0 ? s24.spam / s24.total : 0
    const bounceRate7d = s7d.total > 0 ? s7d.bounced / s7d.total : 0

    let status: DomainHealth['status'] = 'HEALTHY'
    if (!DOMAIN_THROTTLE_CONFIG[domaine].warmupComplete) status = 'WARMING'
    else if (bounceRate24h > 0.03 || spamRate24h > 0.003) status = 'PAUSED'
    else if (bounceRate24h > 0.02 || spamRate24h > 0.002) status = 'WARNING'

    results.push({
      domaine,
      status,
      emails_sent_today: s24.total,
      emails_sent_7days: s7d.total,
      bounce_rate_24h: bounceRate24h,
      bounce_rate_7days: bounceRate7d,
      spam_rate_24h: spamRate24h,
      open_rate_7days: s7d.open_rate || 0,
      inbox_placement_pct: 0, // Via seed tests externes
      warmup_day: DOMAIN_THROTTLE_CONFIG[domaine].warmupComplete ? null : await getWarmupDay(domaine),
    })
  }

  return results
}
```

---

## 10. OUTPUT : DONNEES PRODUITES PAR LE SUIVEUR

### 10.1 Donnees produites

Le Suiveur produit des donnees qui alimentent directement l'Agent 6 (NURTUREUR) et l'Agent 7 (ANALYSTE).

#### Schema des interactions loggees

```typescript
interface InteractionLog {
  interaction_id: string       // UUID
  prospect_id: string
  lead_id: string
  sequence_id: string

  // Action effectuee
  action_type: 'EMAIL_SENT' | 'LINKEDIN_CONNECTION_SENT' | 'LINKEDIN_MESSAGE_SENT' |
               'LINKEDIN_VISIT' | 'LINKEDIN_LIKE' | 'REPLY_RECEIVED' | 'REPLY_CLASSIFIED' |
               'SEQUENCE_STARTED' | 'SEQUENCE_PAUSED' | 'SEQUENCE_STOPPED' | 'SEQUENCE_COMPLETED' |
               'BOUNCE_HARD' | 'BOUNCE_SOFT' | 'OPT_OUT' | 'NOTIFICATION_SENT'
  canal: 'email' | 'linkedin' | 'system'

  // Details
  etape_numero: number | null
  domaine_envoi: string | null
  gmail_message_id: string | null
  waalaxy_campaign_id: string | null

  // Si reponse
  reply_classification: string | null     // INTERESSE, PAS_MAINTENANT, etc.
  reply_confidence: number | null
  reply_sentiment: string | null

  // Status
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'DEFERRED'
  error_message: string | null

  // Timestamps
  created_at: string
  processed_at: string
}
```

#### Schema du statut prospect mis a jour

```typescript
interface ProspectStatusUpdate {
  prospect_id: string

  // Statut sequence
  sequence_status: 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'COMPLETED'
  current_step: number
  total_steps: number
  next_step_scheduled_at: string | null

  // Engagement
  emails_sent: number
  emails_opened: number       // Si tracking actif (nurturing seulement)
  linkedin_actions: number
  replies_received: number
  last_interaction_at: string

  // Classification
  last_reply_category: string | null
  interest_level: 'HOT' | 'WARM' | 'COLD' | 'NOT_INTERESTED' | null
  handled: boolean

  // Timing
  first_contact_at: string
  last_contact_at: string
  sequence_duration_days: number
}
```

### 10.2 Output vers Agent 6 (NURTUREUR)

Quand une sequence se termine sans conversion (prospect n'a pas repondu ou a repondu PAS_MAINTENANT), le Suiveur transmet le prospect au NURTUREUR pour un suivi long terme.

```typescript
interface NurturerHandoff {
  prospect_id: string
  lead_id: string

  // Raison du handoff
  handoff_reason: 'SEQUENCE_COMPLETED_NO_REPLY' | 'PAS_MAINTENANT' | 'INTERESTED_SOFT_NO_FOLLOWUP'

  // Historique de la sequence
  sequence_summary: {
    sequence_id: string
    steps_completed: number
    total_steps: number
    emails_sent: number
    linkedin_actions: number
    duration_days: number
    replies: Array<{
      category: string
      date: string
    }>
  }

  // Recommendations pour le nurturing
  nurturing_recommendations: {
    resume_date: string | null          // Date de reprise suggeree
    suggested_content_type: string      // 'case_study', 'blog', 'event', 'newsletter'
    last_signal: string                 // Dernier signal business detecte
    engagement_score: number            // 0-100 base sur les interactions
  }

  // Donnees prospect completes
  prospect: {
    prenom: string
    nom: string
    email: string
    entreprise_nom: string
    poste: string
    segment: string
    scoring_categorie: string
  }

  metadata: {
    agent: 'agent_5_suiveur'
    handoff_at: string
    suiveur_version: string
  }
}

// Dispatch vers Agent 6 via BullMQ
async function handoffToNurturer(data: NurturerHandoff): Promise<void> {
  await nurturerQueue.add(
    `nurture-${data.prospect_id}`,
    data,
    {
      priority: data.handoff_reason === 'PAS_MAINTENANT' ? 3 : 7,
      delay: 0,
    }
  )
}
```

### 10.3 Output vers Agent 7 (ANALYSTE)

Le Suiveur produit des metriques en temps reel que l'Analyste agrege pour les rapports.

```typescript
interface AnalysteMetrics {
  // Metriques d'envoi
  envoi: {
    periode: string                    // 'daily', 'weekly', 'monthly'
    date: string
    emails_envoyes: number
    linkedin_connections_envoyees: number
    linkedin_messages_envoyes: number
    linkedin_visites: number
    total_actions: number
  }

  // Metriques de delivrabilite
  delivrabilite: {
    par_domaine: Array<{
      domaine: string
      emails_envoyes: number
      bounce_rate: number
      spam_rate: number
      inbox_placement: number          // % (via seed tests)
    }>
    bounce_rate_global: number
    spam_rate_global: number
  }

  // Metriques de reponses
  reponses: {
    total_reponses: number
    par_categorie: Record<string, number>  // INTERESSE: 5, PAS_MAINTENANT: 12, etc.
    reply_rate: number                     // reponses / emails envoyes
    temps_reponse_moyen_heures: number
    par_etape: Record<number, number>      // Etape 1: 58%, Etape 2: 25%, etc.
  }

  // Metriques de sequences
  sequences: {
    actives: number
    completees: number
    stoppees_reponse: number
    stoppees_bounce: number
    stoppees_optout: number
    duree_moyenne_jours: number
  }

  // Metriques de conversion
  conversion: {
    prospects_contactes: number
    replies_positives: number             // INTERESSE + INTERESSE_SOFT
    taux_conversion_brut: number          // replies positives / prospects contactes
    par_segment: Record<string, {
      contactes: number
      replies: number
      conversion: number
    }>
    par_categorie_scoring: Record<string, {
      contactes: number
      replies: number
      conversion: number
    }>
  }

  // Metriques de notification
  notifications: {
    total_envoyees: number
    sla_respectes: number
    sla_breaches: number
    temps_traitement_moyen_minutes: number
  }

  // Metriques de cout
  couts: {
    claude_api_classification_usd: number
    emails_envoyes_cout_eur: number      // Infrastructure
    linkedin_tool_eur: number            // Waalaxy
    total_eur: number
  }
}

// Vue SQL pour l'Agent 7
const ANALYSTE_VIEWS_SQL = `
-- Vue metriques envoi quotidien
CREATE OR REPLACE VIEW v_metrics_envoi_daily AS
SELECT
  DATE(sent_at) as date,
  canal,
  domaine_envoi,
  categorie,
  segment,
  COUNT(*) as total_envoyes,
  COUNT(*) FILTER (WHERE status = 'SENT') as sent_ok,
  COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
  COUNT(*) FILTER (WHERE status = 'FAILED') as failed
FROM email_sends
GROUP BY DATE(sent_at), canal, domaine_envoi, categorie, segment;

-- Vue metriques reponses
CREATE OR REPLACE VIEW v_metrics_reponses AS
SELECT
  DATE(classified_at) as date,
  category,
  canal,
  COUNT(*) as total,
  AVG(confidence) as confidence_moyenne,
  COUNT(*) FILTER (WHERE sentiment = 'positif') as positives,
  COUNT(*) FILTER (WHERE sentiment = 'negatif') as negatives
FROM reply_classifications
GROUP BY DATE(classified_at), category, canal;

-- Vue taux de conversion par segment
CREATE OR REPLACE VIEW v_conversion_par_segment AS
SELECT
  p.segment,
  p.categorie,
  COUNT(DISTINCT p.prospect_id) as total_prospects,
  COUNT(DISTINCT es.prospect_id) as contactes,
  COUNT(DISTINCT rc.prospect_id) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as replies_positives,
  ROUND(
    COUNT(DISTINCT rc.prospect_id) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT'))::numeric /
    NULLIF(COUNT(DISTINCT es.prospect_id), 0) * 100, 2
  ) as taux_conversion_pct
FROM prospects p
LEFT JOIN email_sends es ON es.prospect_id = p.prospect_id
LEFT JOIN reply_classifications rc ON rc.prospect_id = p.prospect_id
GROUP BY p.segment, p.categorie;

-- Vue SLA compliance
CREATE OR REPLACE VIEW v_sla_compliance AS
SELECT
  DATE(n.created_at) as date,
  n.type,
  n.priority,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE n.read_at IS NOT NULL AND n.read_at <= n.sla_deadline) as sla_ok,
  COUNT(*) FILTER (WHERE n.escalated = true) as escalated,
  AVG(EXTRACT(EPOCH FROM (COALESCE(n.read_at, NOW()) - n.created_at)) / 60) as temps_moyen_minutes
FROM notifications n
GROUP BY DATE(n.created_at), n.type, n.priority;
`
```

---

## 11. COUTS

### 11.1 Detail des couts mensuels

| Poste | Cout mensuel | Details |
|---|---|---|
| **Gmail API** | 0 EUR | Gratuit (quotas largement suffisants) |
| **Google Workspace** (2 adresses) | 12 EUR | 6 EUR/utilisateur/mois |
| **Mailgun** (backup delivrabilite) | 30 EUR | Foundation plan, 50K emails/mois |
| **Waalaxy Pro** | 19 EUR | 300+ invitations LinkedIn/mois |
| **Domaines supplementaires** (x2) | 2 EUR | ~12 EUR/domaine/an |
| **Mailreach warmup** (3 adresses) | 60-75 EUR | 20-25 EUR/adresse/mois |
| **Claude API** (classification reponses) | ~5 EUR | ~500 classifications/mois |
| **Redis** (BullMQ) | 0 EUR | Self-hosted ou inclus dans l'infra |
| **Slack** | 0 EUR | Free plan suffisant pour les notifications |
| **Google Cloud Pub/Sub** | < 1 EUR | Quasi gratuit au volume prevu |
| **Infrastructure serveur** | ~20 EUR | VPS pour faire tourner le worker |
| **TOTAL** | **~150 EUR/mois** | |

### 11.2 Cout par classification Claude API

```
Modele : claude-sonnet-4-20250514
Tarif : $3.00 / million tokens input, $15.00 / million tokens output

Par classification de reponse :
- System prompt : ~800 tokens input
- User message (reponse + contexte) : ~400 tokens input
- Total input : ~1200 tokens
- Output (JSON classification) : ~200 tokens

Cout unitaire :
- Input : (1200 / 1M) x $3.00 = $0.0036
- Output : (200 / 1M) x $15.00 = $0.003
- Total : $0.0066 par classification ~ 0.006 EUR

Volume estime : 500 reponses/mois
Cout mensuel classifications : 500 x 0.006 = 3 EUR
Avec marge (re-classifications, tests) : ~5 EUR/mois
```

### 11.3 Cout par prospect (cycle complet)

```
SCENARIO : 1 prospect traverse une sequence complete de 4 emails + 2 actions LinkedIn

Couts directs :
- Envoi emails (Gmail API) : 0 EUR
- Envoi LinkedIn (Waalaxy, au prorata) : ~0.06 EUR
- Si reponse, classification Claude : 0.006 EUR
- Si reponse, notification Slack : 0 EUR
- Infrastructure (au prorata) : ~0.04 EUR

Cout par prospect : ~0.10 EUR

Pour 500 prospects/mois : ~50 EUR de couts directs
```

---

## 12. VERIFICATION DE COHERENCE

### 12.1 Input == Output Agent 4

Verification que chaque champ de l'input du Suiveur (Agent 5) correspond exactement a un champ de l'output du Redacteur (Agent 4).

| Champ input Agent 5 | Present dans output Agent 4 (section 8) | Statut |
|---|---|---|
| `message_id` | `message_id` | VALIDE |
| `prospect_id` | `prospect_id` | VALIDE |
| `lead_id` | `lead_id` | VALIDE |
| `generated_at` | `generated_at` | VALIDE |
| `message.canal` | `message.canal` | VALIDE |
| `message.type` | `message.type` | VALIDE |
| `message.subject_line` | `message.subject_line` | VALIDE |
| `message.body` | `message.body` | VALIDE |
| `message.cta` | `message.cta` | VALIDE |
| `message.signature` | `message.signature` | VALIDE |
| `message.format` | `message.format` | VALIDE |
| `message.word_count` | `message.word_count` | VALIDE |
| `message.language` | `message.language` | VALIDE |
| `linkedin_message.connection_note` | `linkedin_message.connection_note` | VALIDE |
| `linkedin_message.post_connection_message` | `linkedin_message.post_connection_message` | VALIDE |
| `prospect.prenom` | `prospect.prenom` | VALIDE |
| `prospect.nom` | `prospect.nom` | VALIDE |
| `prospect.email` | `prospect.email` | VALIDE |
| `prospect.email_verified` | `prospect.email_verified` | VALIDE |
| `prospect.linkedin_url` | `prospect.linkedin_url` | VALIDE |
| `prospect.poste` | `prospect.poste` | VALIDE |
| `prospect.entreprise_nom` | `prospect.entreprise_nom` | VALIDE |
| `sequence.sequence_id` | `sequence.sequence_id` | VALIDE |
| `sequence.etape_actuelle` | `sequence.etape_actuelle` | VALIDE |
| `sequence.etape_total` | `sequence.etape_total` | VALIDE |
| `sequence.etape_type` | `sequence.etape_type` | VALIDE |
| `sequence.prochaine_etape_dans_jours` | `sequence.prochaine_etape_dans_jours` | VALIDE |
| `sequence.espacement_jours` | `sequence.espacement_jours` | VALIDE |
| `template.template_id` | `template.template_id` | VALIDE |
| `template.template_version` | `template.template_version` | VALIDE |
| `template.template_status` | `template.template_status` | VALIDE |
| `template.ab_test_id` | `template.ab_test_id` | VALIDE |
| `template.ab_variant` | `template.ab_variant` | VALIDE |
| `scoring.score_total` | `scoring.score_total` | VALIDE |
| `scoring.categorie` | `scoring.categorie` | VALIDE |
| `scoring.sous_categorie` | `scoring.sous_categorie` | VALIDE |
| `scoring.segment` | `scoring.segment` | VALIDE |
| `scoring.signal_principal` | `scoring.signal_principal` | VALIDE |
| `validation.statut` | `validation.statut` | VALIDE |
| `validation.validated_by` | `validation.validated_by` | VALIDE |
| `validation.validated_at` | `validation.validated_at` | VALIDE |
| `validation.quality_checks` | `validation.quality_checks` | VALIDE |
| `routing.canal_principal` | `routing.canal_principal` | VALIDE |
| `routing.canal_secondaire` | `routing.canal_secondaire` | VALIDE |
| `routing.urgence` | `routing.urgence` | VALIDE |
| `routing.sla_heures` | `routing.sla_heures` | VALIDE |
| `routing.priorite_queue` | `routing.priorite_queue` | VALIDE |
| `routing.domaine_envoi_suggere` | `routing.domaine_envoi_suggere` | VALIDE |
| `impact_data.*` | `impact_data.*` | VALIDE |
| `metadata.*` | `metadata.*` | VALIDE |

**RESULTAT : 100% de coherence input Agent 5 / output Agent 4.**

### 12.2 Outputs vers Agent 6 (NURTUREUR)

| Donnee produite par Agent 5 | Necessaire pour Agent 6 | Raison |
|---|---|---|
| `NurturerHandoff.prospect_id` | OUI | Identifier le prospect |
| `NurturerHandoff.handoff_reason` | OUI | Adapter le type de nurturing |
| `NurturerHandoff.sequence_summary` | OUI | Savoir ce qui a deja ete fait |
| `NurturerHandoff.nurturing_recommendations` | OUI | Guider le contenu de nurturing |
| `NurturerHandoff.prospect.*` | OUI | Personnaliser le nurturing |
| `InteractionLog.*` | OUI | Historique complet des interactions |
| `ProspectStatusUpdate.*` | OUI | Etat actuel du prospect |

**RESULTAT : L'output Agent 5 contient tous les champs necessaires pour l'Agent 6.**

### 12.3 Outputs vers Agent 7 (ANALYSTE)

| Donnee produite par Agent 5 | Necessaire pour Agent 7 | Raison |
|---|---|---|
| `AnalysteMetrics.envoi` | OUI | KPIs d'activite |
| `AnalysteMetrics.delivrabilite` | OUI | Sante des domaines |
| `AnalysteMetrics.reponses` | OUI | Taux de reponse par categorie |
| `AnalysteMetrics.sequences` | OUI | Performance des sequences |
| `AnalysteMetrics.conversion` | OUI | ROI par segment |
| `AnalysteMetrics.notifications` | OUI | SLA compliance |
| `AnalysteMetrics.couts` | OUI | Suivi budget |
| Vues SQL (`v_metrics_*`) | OUI | Requetes directes pour rapports |

**RESULTAT : L'output Agent 5 contient tous les champs necessaires pour l'Agent 7.**

### 12.4 Coherence du flux complet

```
Agent 4 output (RedacteurOutput)
    |
    | via BullMQ queue 'suiveur-pipeline'
    | priorite: HOT=1, WARM=5, COLD=10
    |
    v
Agent 5 input (SuiveurInput) = copie exacte de RedacteurOutput
    |
    | Traitement par sous-agents 5a/5b/5c/5d
    |
    v
Agent 5 outputs :
    |
    +---> InteractionLog (toutes les actions)
    |     --> Stocke en PostgreSQL
    |     --> Accessible par Agent 7 via vues SQL
    |
    +---> ProspectStatusUpdate (statuts mis a jour)
    |     --> Stocke en PostgreSQL
    |     --> Lu par Agent 6 pour decisions nurturing
    |
    +---> NurturerHandoff (quand sequence terminee/pausee)
    |     --> Via BullMQ queue 'nurturer-pipeline'
    |     --> Consomme par Agent 6
    |
    +---> AnalysteMetrics (metriques agregees)
    |     --> Via vues SQL materialisees
    |     --> Consomme par Agent 7
    |
    +---> Notifications Slack (evenements importants)
          --> Via Slack API
          --> Consomme par Jonathan
```

### 12.5 Tables SQL de l'Agent 5

```sql
-- Table des envois email
CREATE TABLE IF NOT EXISTS email_sends (
  id SERIAL PRIMARY KEY,
  message_id UUID NOT NULL,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  lead_id UUID NOT NULL,
  sequence_id VARCHAR(50) NOT NULL,
  etape_numero INTEGER NOT NULL,
  canal VARCHAR(30) NOT NULL,
  domaine_envoi VARCHAR(100) NOT NULL,
  gmail_message_id VARCHAR(255),
  gmail_thread_id VARCHAR(255),
  subject_line VARCHAR(200),
  body_preview VARCHAR(500),
  categorie VARCHAR(20) NOT NULL,
  sous_categorie VARCHAR(10),
  segment VARCHAR(30) NOT NULL,
  template_id VARCHAR(30),
  ab_test_id VARCHAR(50),
  ab_variant CHAR(1),
  idempotency_key VARCHAR(200) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'BOUNCED', 'FAILED', 'SPAM_COMPLAINT', 'CANCELLED')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  opened BOOLEAN DEFAULT false,
  opened_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_sends_prospect ON email_sends(prospect_id);
CREATE INDEX idx_email_sends_domaine ON email_sends(domaine_envoi);
CREATE INDEX idx_email_sends_status ON email_sends(status);
CREATE INDEX idx_email_sends_date ON email_sends(sent_at);
CREATE INDEX idx_email_sends_idempotency ON email_sends(idempotency_key);

-- Table des actions LinkedIn
CREATE TABLE IF NOT EXISTS linkedin_actions (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  action_type VARCHAR(30) NOT NULL
    CHECK (action_type IN ('connection_request', 'message', 'profile_visit', 'like', 'comment')),
  linkedin_url VARCHAR(500),
  waalaxy_campaign_id VARCHAR(100),
  content TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'FAILED', 'RATE_LIMITED', 'CANCELLED', 'PAUSED_RESTRICTION')),
  delay_applied_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_linkedin_actions_prospect ON linkedin_actions(prospect_id);
CREATE INDEX idx_linkedin_actions_type ON linkedin_actions(action_type);
CREATE INDEX idx_linkedin_actions_status ON linkedin_actions(status);
CREATE INDEX idx_linkedin_actions_date ON linkedin_actions(created_at);

-- Table des classifications de reponses
CREATE TABLE IF NOT EXISTS reply_classifications (
  id SERIAL PRIMARY KEY,
  reply_id VARCHAR(255) NOT NULL UNIQUE,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  sequence_id VARCHAR(50),
  etape_repondue INTEGER,
  email_body TEXT,
  from_address VARCHAR(255),
  canal VARCHAR(20) DEFAULT 'email',
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('INTERESSE', 'INTERESSE_SOFT', 'PAS_MAINTENANT', 'PAS_INTERESSE',
                         'MAUVAISE_PERSONNE', 'DEMANDE_INFO', 'OUT_OF_OFFICE', 'SPAM')),
  confidence NUMERIC(3,2) NOT NULL,
  sentiment VARCHAR(10),
  action_suggeree TEXT,
  date_retour_ooo DATE,
  personne_referree_nom VARCHAR(200),
  personne_referree_email VARCHAR(255),
  personne_referree_poste VARCHAR(100),
  phrase_cle TEXT,
  raisonnement TEXT,
  classification_model VARCHAR(50),
  classification_cost_usd NUMERIC(8,5),
  tokens_input INTEGER,
  tokens_output INTEGER,
  handled BOOLEAN DEFAULT false,
  handled_by VARCHAR(50),
  handled_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  classified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reply_class_prospect ON reply_classifications(prospect_id);
CREATE INDEX idx_reply_class_category ON reply_classifications(category);
CREATE INDEX idx_reply_class_handled ON reply_classifications(handled) WHERE handled = false;
CREATE INDEX idx_reply_class_date ON reply_classifications(classified_at);

-- Table des sequences prospect
CREATE TABLE IF NOT EXISTS prospect_sequences (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  sequence_id VARCHAR(50) NOT NULL,
  categorie VARCHAR(20) NOT NULL,
  segment VARCHAR(30),
  total_steps INTEGER NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'STOPPED', 'COMPLETED')),
  gaps_days JSONB,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMP WITH TIME ZONE,
  stopped_at TIMESTAMP WITH TIME ZONE,
  stopped_reason VARCHAR(50),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(prospect_id, sequence_id)
);

CREATE INDEX idx_prospect_seq_status ON prospect_sequences(status);
CREATE INDEX idx_prospect_seq_prospect ON prospect_sequences(prospect_id);

-- Table des notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  prospect_id UUID REFERENCES prospects(prospect_id),
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(10) NOT NULL,
  channels JSONB,
  message_preview TEXT,
  sla_deadline TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_unread ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_sla ON notifications(sla_deadline) WHERE escalated = false;

-- Table des evenements bounce
CREATE TABLE IF NOT EXISTS bounce_events (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  message_id UUID,
  bounce_type VARCHAR(10) NOT NULL CHECK (bounce_type IN ('HARD', 'SOFT')),
  error_code INTEGER,
  error_message TEXT,
  email_address VARCHAR(255),
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table des restrictions LinkedIn
CREATE TABLE IF NOT EXISTS linkedin_restrictions (
  id SERIAL PRIMARY KEY,
  restriction_type VARCHAR(50) NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  recovery_days INTEGER,
  phase VARCHAR(30) NOT NULL DEFAULT 'IMMEDIATE_STOP',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RECOVERING', 'RESOLVED')),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Table de cles d'idempotence
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(200) PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_date ON idempotency_keys(created_at);

-- Table RGPD
CREATE TABLE IF NOT EXISTS rgpd_events (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('OPT_OUT', 'DATA_DELETION', 'DATA_EXPORT')),
  source VARCHAR(50),
  data_affected JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table des referrals (mauvaise personne)
CREATE TABLE IF NOT EXISTS referral_leads (
  id SERIAL PRIMARY KEY,
  original_prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  referred_name VARCHAR(200),
  referred_email VARCHAR(255),
  referred_poste VARCHAR(100),
  source_reply_id VARCHAR(255),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table config systeme
CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### 12.6 Variables d'environnement requises

```bash
# === Gmail API ===
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx
GCP_PROJECT_ID=axiom-prospection

# === Mailgun (backup) ===
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=axiom-marketing.fr

# === LinkedIn automation ===
WAALAXY_API_KEY=xxx
WAALAXY_WEBHOOK_SECRET=xxx

# === Claude API (classification) ===
ANTHROPIC_API_KEY=sk-ant-xxx

# === Slack ===
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_JONATHAN_DM_CHANNEL=DXXXXX

# === Base de donnees ===
DATABASE_URL=postgresql://user:pass@localhost:5432/axiom_prospection
REDIS_HOST=localhost
REDIS_PORT=6379

# === Configuration ===
APP_URL=https://app.axiom-marketing.fr
NODE_ENV=production
TIMEZONE_DEFAULT=Indian/Reunion

# === Gmail credentials pour IMAP (fallback) ===
GMAIL_USER=jonathan@axiom-marketing.fr
GMAIL_APP_PASSWORD=xxx
```

---

## 13. INTEGRATION AVEC LES AGENTS 8, 9, 10

> **Ajout v1.1 -- 19 mars 2026** : Cette section documente l'integration du Suiveur avec les trois nouveaux agents du pipeline etendu (Agent 8 Dealmaker, Agent 9 Appels d'offres, Agent 10 CSM).

### 13.1 Synthese de l'impact

| Agent | Impact sur Agent 5 | Nature |
|-------|-------------------|--------|
| **Agent 8 (Dealmaker)** | SIGNIFICATIF | Le flux "prospect INTERESSE" est formalise : apres notification Jonathan et RDV decouverte, le prospect est transmis a l'Agent 8 pour le closing. Nouveau flux sortant a documenter. |
| **Agent 9 (Appels d'offres)** | AUCUN | L'Agent 9 est sur un flux completement independant (Agent 1b --> Agent 9). Le Suiveur n'interagit pas avec le pipeline AO. |
| **Agent 10 (CSM)** | AUCUN (direct) | L'Agent 10 recoit ses clients de l'Agent 8 (deal signe). Le Suiveur n'a aucun flux direct vers l'Agent 10. Les leads referral generes par l'Agent 10 entrent dans le pipeline par l'Agent 1, pas par l'Agent 5. |

### 13.2 Nouveau flux : INTERESSE --> Agent 8 (Dealmaker)

#### 13.2.1 Contexte

Actuellement (specs v1.0), quand un prospect repond "INTERESSE", le Suiveur :
1. Arrete la sequence
2. Met a jour le statut prospect (`INTERESTED`, `interest_level: HOT`)
3. Notifie Jonathan en < 5 minutes

**Avec l'Agent 8**, le flux est etendu : apres que Jonathan a effectue le RDV decouverte et confirme l'opportunite, le prospect est transmis a l'Agent 8 pour la gestion du pipeline de deals.

#### 13.2.2 Flux mis a jour

```
Prospect repond "INTERESSE"
        |
        v
[Agent 5] Arrete la sequence + notifie Jonathan (SLA < 5 min)
        |
        v
[Jonathan] RDV Decouverte (visio/tel)
        |
        +--> Si opportunite confirmee --> [Agent 8] Pipeline de deals (closing)
        |
        +--> Si pas d'opportunite --> [Agent 6] Nurturing (PAS_MAINTENANT)
```

**IMPORTANT** : Ce flux vers l'Agent 8 est **PARALLELE** au flux existant vers l'Agent 6. Il ne le remplace pas. Le Suiveur continue d'envoyer les prospects sans reponse et PAS_MAINTENANT vers l'Agent 6 comme avant.

#### 13.2.3 Modification de handleInteresse()

```typescript
private async handleInteresse(replyData: any, classification: ReplyClassification): Promise<void> {
  // 1. Arreter la sequence IMMEDIATEMENT (INCHANGE)
  await this.stopSequence(replyData.prospect_id, replyData.sequence_id)

  // 2. Mettre a jour le statut prospect (INCHANGE)
  await db.query(
    `UPDATE prospects SET status = 'INTERESTED', last_reply_at = NOW(),
     interest_level = 'HOT' WHERE prospect_id = $1`,
    [replyData.prospect_id]
  )

  // 3. Notifier Jonathan en < 5 minutes avec boutons d'action (MIS A JOUR)
  await notifyJonathan({
    type: 'HOT_LEAD_REPLY',
    prospect_id: replyData.prospect_id,
    priority: 'URGENT',
    reply_snippet: classification.phrase_cle,
    full_reply: replyData.email_body,
    action: classification.action_suggeree,
    sla_minutes: 5,
    // ═══ NOUVEAU : Boutons post-RDV pour routing vers Agent 8 ou Agent 6 ═══
    post_rdv_actions: [
      { label: 'Opportunite confirmee → Pipeline Deals', action: 'HANDOFF_DEALMAKER' },
      { label: 'Pas d opportunite → Nurturing', action: 'HANDOFF_NURTUREUR' },
    ],
  })
}
```

#### 13.2.4 Nouveau handoff vers Agent 8 (DealmakerHandoff)

Quand Jonathan clique sur "Opportunite confirmee" dans Slack, le Suiveur transmet le prospect a l'Agent 8 via la queue BullMQ `dealmaker-pipeline` :

```typescript
interface DealmakerHandoff {
  prospect_id: string
  lead_id: string

  // Contexte du RDV decouverte
  rdv_decouverte: {
    date: string                    // ISO 8601
    notes_jonathan: string          // Notes saisies dans Slack
    budget_estime: number | null    // Budget estime par Jonathan
    decision_timeline: string | null // Timeline de decision
    besoin_principal: string        // Besoin identifie
  }

  // Historique de la prospection (Agent 5)
  prospection_summary: {
    sequence_id: string
    steps_completed: number
    total_steps: number
    emails_sent: number
    linkedin_actions: number
    reply_category: 'INTERESSE'
    reply_date: string
    reply_snippet: string
  }

  // Donnees prospect completes
  prospect: {
    entreprise: string
    prenom: string
    nom: string
    poste: string
    email: string
    telephone: string | null
    segment: string
    score_total: number
    categorie: string
  }

  // Metadata
  metadata: {
    handoff_at: string
    suiveur_version: string
    source: 'agent5_interesse'
  }
}

// Dispatch vers Agent 8
async function handoffToDealmaker(prospect: any, rdvNotes: any): Promise<void> {
  const handoff: DealmakerHandoff = {
    prospect_id: prospect.prospect_id,
    lead_id: prospect.lead_id,
    rdv_decouverte: rdvNotes,
    prospection_summary: await buildProspectionSummary(prospect.prospect_id),
    prospect: await loadProspectForHandoff(prospect.prospect_id),
    metadata: {
      handoff_at: new Date().toISOString(),
      suiveur_version: '1.1',
      source: 'agent5_interesse',
    },
  }

  await dealmakerQueue.add('new-deal', handoff, {
    priority: 1,  // Haute priorite
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })

  // Logger le handoff
  await db.query(
    `INSERT INTO agent_handoffs (source_agent, target_agent, prospect_id, handoff_type, payload)
     VALUES ('agent5', 'agent8', $1, 'INTERESSE_TO_DEALMAKER', $2)`,
    [prospect.prospect_id, JSON.stringify(handoff)]
  )
}
```

#### 13.2.5 Classification des reponses mise a jour

| Categorie reponse | Action AVANT (v1.0) | Action APRES (v1.1) |
|---|---|---|
| **INTERESSE** | Arrete sequence + notifie Jonathan | Arrete sequence + notifie Jonathan + **boutons post-RDV (Agent 8 ou Agent 6)** |
| **INTERESSE_SOFT** | Pause sequence + notifie Jonathan | INCHANGE |
| **PAS_MAINTENANT** | Arrete sequence + handoff Agent 6 | INCHANGE |
| **PAS_INTERESSE** | Arrete sequence + archive | INCHANGE |
| **MAUVAISE_PERSONNE** | Arrete sequence + notification | INCHANGE |
| **DEMANDE_INFO** | Pause sequence + notifie Jonathan | INCHANGE |
| **OUT_OF_OFFICE** | Planifie relance apres retour | INCHANGE |
| **SPAM** | Archive + blocklist | INCHANGE |

### 13.3 Flux sortants mis a jour

| Flux sortant | Destination | Condition | Statut |
|---|---|---|---|
| `nurturer-pipeline` --> Agent 6 | Prospects sans reponse, PAS_MAINTENANT, INTERESSE_SOFT sans suite | Sequence terminee sans conversion | INCHANGE |
| Agent 7 (via tables SQL) | Metriques d'envoi, reponses, sequences | Toujours (logs BDD) | INCHANGE |
| **`dealmaker-pipeline` --> Agent 8** | **Prospects INTERESSE apres RDV decouverte confirme par Jonathan** | **Jonathan clique "Opportunite confirmee" dans Slack** | **NOUVEAU** |

### 13.4 Ce qui NE change PAS

| Composant | Changement |
|-----------|-----------|
| Sous-agents 5a (Envoyeur Email), 5b (Envoyeur LinkedIn), 5c (Scheduler), 5d (Classificateur) | AUCUN |
| Sequences par segment (5 segments x N etapes) | AUCUN |
| Scheduling (horaires, timezone, throttling, jours feries) | AUCUN |
| Detection des reponses (Gmail Watch, IMAP, LinkedIn webhook) | AUCUN |
| Classification IA (prompt Claude, 8 categories) | AUCUN -- les categories restent identiques |
| Domain warming plan | AUCUN |
| Gestion des erreurs (bounces, ban LinkedIn, API down) | AUCUN |
| Output vers Agent 6 (NurturerHandoff) | AUCUN |
| Output vers Agent 7 (via tables SQL) | AUCUN |
| Cout (~150 EUR/mois) | AUCUN |

---

## FIN DU DOCUMENT

**Verification finale :**

| Section | Presente | Complete |
|---|---|---|
| 1. Mission | OUI | OUI |
| 2. Input (schema JSON) | OUI | OUI -- 100% coherent avec output Agent 4 |
| 3. Sous-agents (5a, 5b, 5c, 5d) | OUI | OUI -- code TypeScript reel pour chacun |
| 4. Sequences completes (5 segments) | OUI | OUI -- JSON complet jour par jour |
| 5. Scheduling | OUI | OUI -- horaires, timezone, throttling, jours feries |
| 6. Detection reponses | OUI | OUI -- Gmail Watch, IMAP, LinkedIn webhook, prompt Claude |
| 7. Notifications | OUI | OUI -- Slack Block Kit, boutons, SLA, escalade |
| 8. Gestion erreurs | OUI | OUI -- bounces, ban LinkedIn, API down, doublons, opt-out |
| 9. Domain warming plan | OUI | OUI -- plan jour par jour pour 3 domaines sur 6 semaines |
| 10. Output | OUI | OUI -- schemas vers Agent 6 + Agent 7, vues SQL |
| 11. Couts | OUI | OUI -- detail par poste, cout/prospect, cout/classification |
| 12. Verification coherence | OUI | OUI -- input/output valides, tables SQL, env vars |
