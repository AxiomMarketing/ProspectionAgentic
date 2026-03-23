# SOUS-AGENT 5c — DETECTEUR DE REPONSES
**Agent parent** : AGENT-5-MASTER.md
**Mission** : Detecter et classifier les reponses email/LinkedIn en temps reel

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

