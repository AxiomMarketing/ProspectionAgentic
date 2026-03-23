# SOUS-AGENT 5a — ENVOYEUR EMAIL
**Agent parent** : AGENT-5-MASTER.md
**Mission** : Envoyer les emails au bon moment avec tracking et delivrabilite optimale

---

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

