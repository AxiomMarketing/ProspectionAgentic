# SOUS-AGENT 8c — GESTIONNAIRE DE SIGNATURE
**Agent parent** : AGENT-8-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 3c.1 Mission

Gerer l'integralite du processus de signature electronique : generation du contrat a partir du devis accepte, envoi via Yousign API V3, tracking du statut, relance signature, et declenchement automatique de l'onboarding post-signature.

## 3c.2 Architecture technique

```
Devis accepte par le prospect
    |
    v
+---------------------------------------------------+
| SOUS-AGENT 8c : GESTIONNAIRE DE SIGNATURE          |
| 1. Generer contrat depuis devis (Puppeteer)         |
| 2. Creer signature request (Yousign API V3)         |
| 3. Ajouter signataires + document + champs          |
| 4. Activer la demande (envoi email signature)        |
| 5. Ecouter webhooks (signature.done, expired)        |
| 6. Relancer si pas de signature (J2/J5/J7)           |
| 7. Telecharger contrat signe                         |
| 8. Declencher onboarding (Agent 10 CSM)              |
+---------------------------------------------------+
    |
    v
Deal signe --> Agent 10 (CSM) pour onboarding
```

## 3c.3 Yousign API V3 -- Endpoints et integration

**Configuration :**

```typescript
// Configuration Yousign API V3
const YOUSIGN_CONFIG = {
  base_url: 'https://api.yousign.app/v3',  // Production
  sandbox_url: 'https://staging-api.yousign.app/v3',  // Sandbox
  api_key: process.env.YOUSIGN_API_KEY!,
  webhook_secret: process.env.YOUSIGN_WEBHOOK_SECRET!,
  // IPs a whitelister pour les webhooks :
  // 57.130.41.144/28, 51.38.96.112/28, 5.39.7.128/28
}
```

## 3c.4 Code TypeScript complet

```typescript
import crypto from 'crypto'
import { db, slack, emailService, dealmakerQueue, csmQueue, analysteQueue } from './services'

// ============================================================
// INTERFACES YOUSIGN API V3
// ============================================================

interface YousignSignatureRequest {
  id: string
  status: 'draft' | 'ongoing' | 'done' | 'expired' | 'canceled' | 'rejected'
  name: string
  delivery_mode: 'email' | 'none'
  created_at: string
  updated_at: string
  expiration_date: string
  signers: YousignSigner[]
  documents: YousignDocument[]
}

interface YousignSigner {
  id: string
  info: {
    first_name: string
    last_name: string
    email: string
    phone_number?: string
    locale: 'fr' | 'en'
  }
  status: 'initiated' | 'notified' | 'verified' | 'processing' | 'consent_given' | 'signed' | 'aborted' | 'error'
  signature_level: 'electronic_signature' | 'advanced_electronic_signature' | 'electronic_signature_with_qualified_certificate'
  signature_authentication_mode: 'otp_email' | 'otp_sms' | 'no_otp'
  sign_url?: string
}

interface YousignDocument {
  id: string
  nature: 'signable_document' | 'attachment'
  content_type: string
  filename: string
  total_pages: number
}

interface YousignWebhookPayload {
  event_id: string
  event_name: string
  event_time: number
  subscription_id: string
  sandbox: boolean
  data: {
    signature_request: {
      id: string
      status: string
      name: string
      signers: Array<{
        id: string
        status: string
        signed_at?: string
      }>
    }
  }
}

// ============================================================
// CLIENT YOUSIGN API V3
// ============================================================

class YousignClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = process.env.NODE_ENV === 'production'
      ? YOUSIGN_CONFIG.base_url
      : YOUSIGN_CONFIG.sandbox_url
    this.apiKey = YOUSIGN_CONFIG.api_key
  }

  private async request(method: string, path: string, body?: any, isMultipart = false): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
    }

    let requestBody: any
    if (isMultipart) {
      // Pour upload de documents : multipart/form-data
      requestBody = body  // FormData
    } else {
      headers['Content-Type'] = 'application/json'
      requestBody = body ? JSON.stringify(body) : undefined
    }

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Yousign API error ${response.status}: ${errorBody}`)
    }

    // Pour les downloads binaires (PDF), retourner le buffer
    if (response.headers.get('content-type')?.includes('application/pdf')) {
      return response.arrayBuffer()
    }

    return response.json()
  }

  // --- 1. CREER UNE SIGNATURE REQUEST ---
  async createSignatureRequest(params: {
    name: string
    delivery_mode: 'email' | 'none'
    timezone?: string
    expiration_date?: string
  }): Promise<YousignSignatureRequest> {
    return this.request('POST', '/signature_requests', {
      name: params.name,
      delivery_mode: params.delivery_mode,
      timezone: params.timezone || 'Europe/Paris',
      ordered_signers: false,
      expiration_date: params.expiration_date,
    })
  }

  // --- 2. AJOUTER UN SIGNATAIRE ---
  async addSigner(signatureRequestId: string, params: {
    info: {
      first_name: string
      last_name: string
      email: string
      phone_number?: string
      locale?: string
    }
    signature_level?: string
    signature_authentication_mode?: string
  }): Promise<YousignSigner> {
    return this.request('POST', `/signature_requests/${signatureRequestId}/signers`, {
      info: {
        ...params.info,
        locale: params.info.locale || 'fr',
      },
      signature_level: params.signature_level || 'electronic_signature',
      signature_authentication_mode: params.signature_authentication_mode || 'otp_email',
    })
  }

  // --- 3. AJOUTER UN DOCUMENT ---
  async addDocument(signatureRequestId: string, pdfBuffer: Buffer, filename: string): Promise<YousignDocument> {
    const formData = new FormData()
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
    formData.append('file', blob, filename)
    formData.append('nature', 'signable_document')

    return this.request('POST', `/signature_requests/${signatureRequestId}/documents`, formData, true)
  }

  // --- 4. AJOUTER LES CHAMPS DE SIGNATURE ---
  async addSignatureField(signatureRequestId: string, documentId: string, signerId: string, params: {
    page: number
    x: number
    y: number
    width?: number
    height?: number
    type?: string
  }): Promise<any> {
    return this.request('POST', `/signature_requests/${signatureRequestId}/documents/${documentId}/fields`, {
      signer_id: signerId,
      type: params.type || 'signature',
      page: params.page,
      x: params.x,
      y: params.y,
      width: params.width || 200,
      height: params.height || 60,
    })
  }

  // --- 5. ACTIVER LA SIGNATURE REQUEST (ENVOYER) ---
  async activate(signatureRequestId: string): Promise<YousignSignatureRequest> {
    return this.request('POST', `/signature_requests/${signatureRequestId}/activate`)
  }

  // --- 6. RECUPERER LE STATUT ---
  async getStatus(signatureRequestId: string): Promise<YousignSignatureRequest> {
    return this.request('GET', `/signature_requests/${signatureRequestId}`)
  }

  // --- 7. TELECHARGER LE DOCUMENT SIGNE ---
  async downloadSignedDocument(signatureRequestId: string, documentId: string): Promise<ArrayBuffer> {
    return this.request('GET', `/signature_requests/${signatureRequestId}/documents/${documentId}/download`)
  }

  // --- 8. ENVOYER UN RAPPEL ---
  async sendReminder(signatureRequestId: string): Promise<void> {
    await this.request('POST', `/signature_requests/${signatureRequestId}/renotify`)
  }

  // --- 9. ANNULER UNE SIGNATURE ---
  async cancel(signatureRequestId: string, reason?: string): Promise<void> {
    await this.request('DELETE', `/signature_requests/${signatureRequestId}`, {
      reason: reason || 'Annulation par le commercial',
    })
  }
}

const yousign = new YousignClient()

// ============================================================
// CLASSE PRINCIPALE : GESTIONNAIRE DE SIGNATURE
// ============================================================

class SubAgent8c_GestionnaireSignature {

  // --- WORKFLOW PRINCIPAL : DEVIS ACCEPTE -> CONTRAT -> SIGNATURE ---
  async processAcceptedQuote(deal: any): Promise<void> {
    try {
      // 1. Generer le contrat PDF a partir du devis accepte
      const contractPdf = await this.generateContract(deal)

      // 2. Creer la signature request Yousign
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() + 14) // 14 jours pour signer

      const sigRequest = await yousign.createSignatureRequest({
        name: `Contrat_Axiom_${deal.entreprise_nom}_${deal.deal_id.slice(0, 8)}`,
        delivery_mode: 'email',
        timezone: 'Europe/Paris',
        expiration_date: expirationDate.toISOString(),
      })

      // 3. Ajouter le signataire (prospect)
      const signer = await yousign.addSigner(sigRequest.id, {
        info: {
          first_name: deal.prospect_prenom,
          last_name: deal.prospect_nom,
          email: deal.prospect_email,
          phone_number: deal.prospect_telephone || undefined,
          locale: 'fr',
        },
        signature_level: 'electronic_signature',  // eIDAS simple (suffisant contrats commerciaux France)
        signature_authentication_mode: deal.prospect_telephone ? 'otp_sms' : 'otp_email',
      })

      // 4. Upload du document
      const document = await yousign.addDocument(
        sigRequest.id,
        contractPdf,
        `Contrat_Axiom_${deal.entreprise_nom.replace(/\s+/g, '_')}.pdf`
      )

      // 5. Ajouter le champ de signature (derniere page)
      await yousign.addSignatureField(sigRequest.id, document.id, signer.id, {
        page: document.total_pages, // Derniere page
        x: 100,
        y: 650,
        width: 200,
        height: 60,
        type: 'signature',
      })

      // Ajouter un champ date
      await yousign.addSignatureField(sigRequest.id, document.id, signer.id, {
        page: document.total_pages,
        x: 350,
        y: 670,
        width: 150,
        height: 30,
        type: 'text',
      })

      // 6. Activer la signature request (envoie l'email au signataire)
      await yousign.activate(sigRequest.id)

      // 7. Mettre a jour le deal en BDD
      await db.deals.update({
        deal_id: deal.deal_id,
        stage: 'SIGNATURE_EN_COURS',
        yousign_signature_request_id: sigRequest.id,
        yousign_document_id: document.id,
        yousign_signer_id: signer.id,
        contrat_envoye_at: new Date(),
      })

      // 8. Programmer les rappels de signature
      await this.scheduleSignatureReminders(deal.deal_id)

      // 9. Notifier Jonathan
      await slack.send('#deals', {
        text: `Contrat envoye pour signature : ${deal.prospect_prenom} ${deal.prospect_nom} @ ${deal.entreprise_nom} (${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT)`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Contrat envoye pour e-signature*\n\nProspect : ${deal.prospect_prenom} ${deal.prospect_nom}\nEntreprise : ${deal.entreprise_nom}\nMontant : ${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT\nTier : ${deal.tier_final.toUpperCase()}\nExpiration : ${expirationDate.toLocaleDateString('fr-FR')}` }
          }
        ]
      })

    } catch (error: any) {
      console.error(`[Agent8c] Erreur signature pour deal ${deal.deal_id}:`, error)
      await slack.send('#deals-errors', {
        text: `Erreur envoi contrat signature : ${deal.entreprise_nom} - ${error.message}`,
      })
      throw error
    }
  }

  // --- GENERATION DU CONTRAT PDF ---
  private async generateContract(deal: any): Promise<Buffer> {
    const paiementTerms = deal.montant_final >= 10000
      ? '30% a la signature, 40% a la validation des maquettes, 30% a la livraison'
      : '50% a la signature, 50% a la livraison'

    const contractHtml = this.buildContractHtml(deal, paiementTerms)

    // Generer le PDF avec Puppeteer
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
    const page = await browser.newPage()
    await page.setContent(contractHtml, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '25mm', right: '20mm', bottom: '30mm', left: '20mm' },
    })
    await browser.close()

    return Buffer.from(pdfBuffer)
  }

  private buildContractHtml(deal: any, paiementTerms: string): string {
    const template = SERVICE_TEMPLATES[deal.type_projet]
    const tierConfig = template ? template[deal.tier_final as 'bronze' | 'silver' | 'gold'] : null

    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.6; color: #333; }
        h1 { font-size: 24px; text-align: center; margin-bottom: 30px; }
        h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 24px; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .partie { padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        table td, table th { padding: 8px; border: 1px solid #e0e0e0; text-align: left; }
        table th { background: #f5f5f5; }
        .signature-block { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .signature-zone { border: 1px dashed #999; height: 100px; text-align: center; padding-top: 70px; font-size: 11px; color: #999; }
        .footer-legal { font-size: 10px; color: #666; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
      </style>
    </head>
    <body>
      <h1>CONTRAT DE PRESTATION DE SERVICES</h1>

      <h2>Article 1 -- Parties</h2>
      <div class="parties">
        <div class="partie">
          <strong>LE PRESTATAIRE</strong><br>
          UNIVILE SAS (Axiom Marketing)<br>
          SIRET : XXXXXXXXX<br>
          Represente par Jonathan Dewaele, Dirigeant
        </div>
        <div class="partie">
          <strong>LE CLIENT</strong><br>
          ${deal.entreprise_nom}<br>
          SIRET : ${deal.entreprise_siret}<br>
          Represente par ${deal.prospect_prenom} ${deal.prospect_nom}, ${deal.prospect_poste}
        </div>
      </div>

      <h2>Article 2 -- Objet</h2>
      <p>Le Prestataire s'engage a realiser pour le Client les prestations suivantes :</p>
      <p><strong>Projet :</strong> ${template?.display_name || deal.type_projet}</p>
      <p><strong>Formule :</strong> ${tierConfig?.nom || deal.tier_final}</p>

      <h2>Article 3 -- Livrables</h2>
      <ul>
        ${(tierConfig?.features || []).map((f: string) => `<li>${f}</li>`).join('\n')}
      </ul>

      <h2>Article 4 -- Prix et conditions de paiement</h2>
      <table>
        <tr><th>Montant HT</th><td>${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR</td></tr>
        <tr><th>TVA (20%)</th><td>${new Intl.NumberFormat('fr-FR').format(deal.montant_final * 0.2)} EUR</td></tr>
        <tr><th>Montant TTC</th><td>${new Intl.NumberFormat('fr-FR').format(deal.montant_final * 1.2)} EUR</td></tr>
        <tr><th>Echeancier</th><td>${paiementTerms}</td></tr>
      </table>
      <p>En cas de retard de paiement, des penalites de retard au taux de 3 fois le taux d'interet legal seront appliquees, majorees d'une indemnite forfaitaire de 40 EUR pour frais de recouvrement (article L.441-10 du Code de Commerce).</p>

      <h2>Article 5 -- Delais</h2>
      <p><strong>Duree estimee :</strong> ${tierConfig?.timeline_semaines || '8'} semaines a compter de la reception de l'acompte.</p>
      <p><strong>Date de demarrage prevue :</strong> ${deal.start_date || 'A definir apres signature'}</p>

      <h2>Article 6 -- Propriete intellectuelle</h2>
      <p>Le transfert des droits de propriete intellectuelle sur les livrables s'opere au profit du Client a compter du paiement integrale du prix.</p>

      <h2>Article 7 -- Confidentialite</h2>
      <p>Les Parties s'engagent a garder confidentielles toutes les informations echangees dans le cadre de l'execution du present contrat.</p>

      <h2>Article 8 -- Resiliation</h2>
      <p>En cas de manquement grave, le contrat peut etre resilie de plein droit 30 jours apres mise en demeure restee infructueuse.</p>

      <h2>Article 9 -- Loi applicable et juridiction</h2>
      <p>Le present contrat est regi par le droit francais. Tout litige sera soumis aux tribunaux competents de Paris.</p>

      <h2>Article 10 -- Signature</h2>
      <p>Fait en deux exemplaires, par voie electronique conformement aux articles 1366-1367 du Code Civil et au Reglement eIDAS.</p>

      <div class="signature-block">
        <div>
          <p><strong>Le Prestataire</strong></p>
          <p>Jonathan Dewaele, UNIVILE SAS</p>
          <p>Date : ${new Date().toLocaleDateString('fr-FR')}</p>
          <p><em>Signature electronique pre-apposee</em></p>
        </div>
        <div>
          <p><strong>Le Client</strong></p>
          <p>${deal.prospect_prenom} ${deal.prospect_nom}, ${deal.entreprise_nom}</p>
          <p>Date :</p>
          <div class="signature-zone">Zone de signature electronique (Yousign)</div>
        </div>
      </div>

      <div class="footer-legal">
        <p>Ce contrat est signe electroniquement via Yousign, prestataire qualifie eIDAS (QTSP). La signature electronique a la meme valeur juridique qu'une signature manuscrite (articles 1366-1367 du Code Civil francais, Reglement UE eIDAS 910/2014). Les donnees sont hebergees en France (datacenters certifies ANSSI SecNumCloud).</p>
      </div>
    </body>
    </html>`
  }

  // --- WEBHOOK YOUSIGN : RECEPTION DES EVENEMENTS ---
  async handleWebhook(req: Request, res: Response): Promise<void> {
    // 1. Verifier la signature HMAC
    const signature = req.headers['x-yousign-signature-256'] as string
    const rawBody = req.rawBody // Buffer brut du body

    if (!this.verifyWebhookSignature(rawBody, signature)) {
      console.error('[Agent8c] Webhook Yousign: signature HMAC invalide')
      res.status(401).send('Invalid signature')
      return
    }

    // 2. Parser le payload
    const payload: YousignWebhookPayload = JSON.parse(rawBody.toString())

    // 3. Dedupliquer (eviter les doublons de webhook)
    const alreadyProcessed = await db.webhook_events.exists(payload.event_id)
    if (alreadyProcessed) {
      res.status(200).send('Already processed')
      return
    }
    await db.webhook_events.create({ event_id: payload.event_id, processed_at: new Date() })

    // 4. Router selon l'evenement
    try {
      switch (payload.event_name) {
        case 'signature_request.done':
          await this.onSignatureCompleted(payload)
          break

        case 'signature_request.expired':
          await this.onSignatureExpired(payload)
          break

        case 'signature_request.canceled':
          await this.onSignatureCanceled(payload)
          break

        case 'signer.done':
          await this.onSignerSigned(payload)
          break

        case 'signature_request.reminder_executed':
          // Log uniquement
          console.info(`[Agent8c] Rappel Yousign envoye pour ${payload.data.signature_request.id}`)
          break

        default:
          console.info(`[Agent8c] Webhook Yousign non gere: ${payload.event_name}`)
      }

      res.status(200).send('OK')
    } catch (error: any) {
      console.error(`[Agent8c] Erreur traitement webhook: ${error.message}`)
      res.status(500).send('Error processing webhook')
    }
  }

  // --- VERIFICATION HMAC SHA-256 ---
  private verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader) return false

    const computedHash = crypto
      .createHmac('sha256', YOUSIGN_CONFIG.webhook_secret)
      .update(rawBody)
      .digest('hex')

    const expectedSignature = `sha256=${computedHash}`
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHeader)
    )
  }

  // --- EVENEMENT : SIGNATURE COMPLETEE ---
  private async onSignatureCompleted(payload: YousignWebhookPayload): Promise<void> {
    const sigRequestId = payload.data.signature_request.id
    const deal = await db.deals.findByYousignId(sigRequestId)

    if (!deal) {
      console.error(`[Agent8c] Deal non trouve pour Yousign request ${sigRequestId}`)
      return
    }

    // 1. Telecharger le contrat signe
    const signedPdf = await yousign.downloadSignedDocument(sigRequestId, deal.yousign_document_id)
    const signedPdfUrl = await storageService.upload(
      `contrats_signes/${deal.deal_id}_signe.pdf`,
      Buffer.from(signedPdf),
      'application/pdf'
    )

    // 2. Mettre a jour le deal en BDD
    await db.deals.update({
      deal_id: deal.deal_id,
      stage: 'GAGNE',
      date_signature: new Date(),
      contrat_signe_url: signedPdfUrl,
      montant_signe: deal.montant_final,
    })

    // 3. Annuler les rappels de signature programmes
    await this.cancelSignatureReminders(deal.deal_id)

    // 4. Notifier Jonathan (CELEBRATION)
    await slack.send('#deals', {
      text: `:tada: DEAL SIGNE ! ${deal.prospect_prenom} ${deal.prospect_nom} @ ${deal.entreprise_nom} -- ${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'DEAL SIGNE !' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Prospect :* ${deal.prospect_prenom} ${deal.prospect_nom}` },
            { type: 'mrkdwn', text: `*Entreprise :* ${deal.entreprise_nom}` },
            { type: 'mrkdwn', text: `*Montant :* ${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT` },
            { type: 'mrkdwn', text: `*Tier :* ${deal.tier_final.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Cycle :* ${daysBetween(deal.created_at, new Date())} jours` },
            { type: 'mrkdwn', text: `*Relances :* ${deal.nb_relances || 0}` },
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Voir contrat signe' },
              url: signedPdfUrl,
            }
          ]
        }
      ]
    })

    // 5. Transferer au CSM (Agent 10) pour onboarding
    const csmPayload: DealToCSM = {
      deal_id: deal.deal_id,
      prospect_id: deal.prospect_id,
      prospect: {
        prenom: deal.prospect_prenom,
        nom: deal.prospect_nom,
        email: deal.prospect_email,
        telephone: deal.prospect_telephone || undefined,
        linkedin_url: deal.prospect_linkedin_url || undefined,
        poste: deal.prospect_poste,
      },
      entreprise: {
        nom: deal.entreprise_nom,
        siret: deal.entreprise_siret,
        site_web: deal.entreprise_site_web,
        secteur: deal.entreprise_secteur,
        taille: deal.entreprise_taille,
      },
      contrat: {
        montant_ht: deal.montant_final,
        tier: deal.tier_final,
        type_projet: deal.type_projet,
        scope_detaille: deal.scope_livrables || [],
        date_signature: new Date().toISOString(),
        date_demarrage_prevue: deal.start_date || this.calculateStartDate().toISOString(),
        duree_estimee_semaines: SERVICE_TEMPLATES[deal.type_projet]?.[deal.tier_final]?.timeline_semaines || 8,
        conditions_paiement: deal.montant_final >= 10000 ? '30/40/30' : '50/50',
        contrat_pdf_url: signedPdfUrl,
      },
      notes_vente: deal.rdv_notes?.notes_jonathan || '',
    }

    await csmQueue.add(`onboarding-${deal.deal_id}`, csmPayload, { priority: 1 })

    // 6. Envoyer metriques a l'Agent 7 (ANALYSTE)
    const analystePayload: DealMetricsEvent = {
      type: 'deal_won',
      deal_id: deal.deal_id,
      montant: deal.montant_final,
      cycle_days: daysBetween(deal.created_at, new Date()),
      segment: deal.segment,
      tier: deal.tier_final,
      nb_relances: deal.nb_relances || 0,
      source_canal: deal.canal_principal,
      date: new Date().toISOString(),
    }

    await analysteQueue.add('deal-metrics', analystePayload, { priority: 3 })

    // 7. Envoyer un email de bienvenue au client
    await this.sendWelcomeEmail(deal, signedPdfUrl)
  }

  // --- EVENEMENT : SIGNATURE EXPIREE ---
  private async onSignatureExpired(payload: YousignWebhookPayload): Promise<void> {
    const deal = await db.deals.findByYousignId(payload.data.signature_request.id)
    if (!deal) return

    await slack.send('#deals', {
      text: `Signature EXPIREE pour ${deal.entreprise_nom}. Le prospect n'a pas signe dans les 14 jours.`,
    })

    // Option : relancer avec une nouvelle demande de signature
    // ou marquer comme PERDU
    await db.deals.update({
      deal_id: deal.deal_id,
      stage: 'NEGOCIATION', // Revenir en negociation pour relancer
    })
  }

  // --- EVENEMENT : SIGNATURE ANNULEE ---
  private async onSignatureCanceled(payload: YousignWebhookPayload): Promise<void> {
    const deal = await db.deals.findByYousignId(payload.data.signature_request.id)
    if (!deal) return

    await slack.send('#deals', {
      text: `Signature ANNULEE pour ${deal.entreprise_nom}.`,
    })
  }

  // --- EVENEMENT : SIGNATAIRE A SIGNE ---
  private async onSignerSigned(payload: YousignWebhookPayload): Promise<void> {
    // Log pour audit trail
    const sigRequestId = payload.data.signature_request.id
    const deal = await db.deals.findByYousignId(sigRequestId)
    if (deal) {
      console.info(`[Agent8c] Signataire a signe pour deal ${deal.deal_id}`)
    }
  }

  // --- PROGRAMMATION DES RAPPELS DE SIGNATURE ---
  private async scheduleSignatureReminders(dealId: string): Promise<void> {
    // J+2 : premier rappel email
    await dealmakerQueue.add(
      `sig-reminder-${dealId}-1`,
      { type: 'SIGNATURE_REMINDER', deal_id: dealId, step: 1 },
      { delay: 2 * 24 * 60 * 60 * 1000, priority: 2 }
    )

    // J+5 : deuxieme rappel via Yousign (renotify API)
    await dealmakerQueue.add(
      `sig-reminder-${dealId}-2`,
      { type: 'SIGNATURE_REMINDER', deal_id: dealId, step: 2 },
      { delay: 5 * 24 * 60 * 60 * 1000, priority: 2 }
    )

    // J+7 : rappel final + alerte Jonathan pour appel
    await dealmakerQueue.add(
      `sig-reminder-${dealId}-3`,
      { type: 'SIGNATURE_REMINDER', deal_id: dealId, step: 3 },
      { delay: 7 * 24 * 60 * 60 * 1000, priority: 1 }
    )
  }

  async processSignatureReminder(dealId: string, step: number): Promise<void> {
    const deal = await db.deals.findById(dealId)
    if (!deal || deal.stage !== 'SIGNATURE_EN_COURS') return

    switch (step) {
      case 1: // J+2 : rappel email personnalise
        await emailService.send({
          from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
          to: deal.prospect_email,
          subject: `Contrat en attente de signature - ${deal.entreprise_nom}`,
          text: `Bonjour ${deal.prospect_prenom},

Je vous ai transmis notre contrat pour signature electronique il y a 2 jours. Peut-etre est-il passe inapercu ?

Vous pouvez le signer en 2 clics directement depuis l'email Yousign (verifiez aussi vos spams).

Si vous avez des questions sur le contenu du contrat, n'hesitez pas.

Jonathan`
        })
        break

      case 2: // J+5 : rappel via Yousign API
        try {
          await yousign.sendReminder(deal.yousign_signature_request_id)
        } catch (error) {
          console.warn(`[Agent8c] Erreur rappel Yousign: ${error}`)
        }
        break

      case 3: // J+7 : alerte Jonathan pour appel direct
        await slack.send('#deals', {
          text: `ATTENTION : Le contrat pour ${deal.entreprise_nom} (${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR) n'est pas signe depuis 7 jours. Appel recommande.`,
        })

        // Si deal > 10 000 EUR, envoyer aussi un SMS a Jonathan
        if (deal.montant_final > 10000) {
          await slack.dmJonathan(`Contrat non signe depuis 7j : ${deal.entreprise_nom} (${deal.montant_final} EUR). Appeler le prospect.`)
        }
        break
    }
  }

  private async cancelSignatureReminders(dealId: string): Promise<void> {
    // Supprimer les jobs de rappel programmes
    const jobs = await dealmakerQueue.getJobs(['delayed'])
    for (const job of jobs) {
      if (job.name.startsWith(`sig-reminder-${dealId}`)) {
        await job.remove()
      }
    }
  }

  private async sendWelcomeEmail(deal: any, signedPdfUrl: string): Promise<void> {
    await emailService.send({
      from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
      to: deal.prospect_email,
      subject: `Bienvenue chez Axiom Marketing - Prochaines etapes`,
      text: `Bonjour ${deal.prospect_prenom},

Merci pour votre confiance ! Le contrat est signe et votre projet est officiellement lance.

Voici les prochaines etapes :

1. Vous recevrez un email d'onboarding dans les 24h avec un questionnaire de brief
2. Un kickoff call sera programme dans les 3 jours ouvrables
3. Le premier livrable (maquettes / architecture) sera partage dans ${Math.ceil((SERVICE_TEMPLATES[deal.type_projet]?.[deal.tier_final]?.timeline_semaines || 8) * 0.25)} semaines

Votre contrat signe est accessible ici : ${signedPdfUrl}

A tres bientot pour le kickoff !

Jonathan Dewaele
Axiom Marketing`
    })
  }

  private calculateStartDate(): Date {
    const start = new Date()
    start.setDate(start.getDate() + 5) // J+5 apres signature (temps onboarding)
    // Ajuster si weekend
    if (start.getDay() === 0) start.setDate(start.getDate() + 1)
    if (start.getDay() === 6) start.setDate(start.getDate() + 2)
    return start
  }
}
```

## 3c.5 Validite juridique en France

| Aspect | Detail |
|--------|--------|
| **Base legale** | Articles 1366-1367 du Code Civil francais |
| **Reglement europeen** | eIDAS (UE 910/2014), mis a jour eIDAS V2 (2024-2026) |
| **Niveau de signature** | Signature electronique simple (suffisant pour contrats commerciaux B2B) |
| **Prestataire** | Yousign -- Prestataire de Services de Confiance Qualifie (QTSP) |
| **Hebergement donnees** | France (datacenters certifies ANSSI SecNumCloud) |
| **Valeur probante** | Equivalente a une signature manuscrite (art. 1367 CC) |
| **Signature qualifiee** | Necessaire uniquement pour actes notaries, pas pour contrats agence web |

**Impact mesurable :**
- +25-35% de taux de conversion vs signature papier
- -85% de temps de traitement (5-7 jours a < 48h)
- -60% du cycle de vente total

## 3c.6 Pricing Yousign 2026

| Plan | Prix | Signatures/mois | Features |
|------|------|----------------|----------|
| **One** | 11 EUR/mois | Illimitees | Signature simple, 1 user |
| **Plus** | 28 EUR/mois | Illimitees | API V3, templates, rappels auto |
| **Pro** | 48 EUR/mois | Illimitees | Workflows, approbations, branding |

**Recommandation Axiom :** Plan **Plus** a 28 EUR/mois (API V3 + templates + rappels automatiques).

---

**Fin du Sous-Agent 8c -- Gestionnaire de Signature**
