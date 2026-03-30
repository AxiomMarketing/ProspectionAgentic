import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { Deal, DealStage } from '../../domain/entities/deal.entity';
import { Quote } from '../../domain/entities/quote.entity';

export interface DealToCSM {
  dealId: string;
  prospectId: string;
  companyName: string;
  mrrEur: number;
  contractUrl: string;
}

interface YousignSignatureRequest {
  id: string;
  status: string;
  name: string;
  delivery_mode: string;
  expiration_date: string;
}

interface YousignDocument {
  id: string;
  nature: string;
  filename: string;
}

interface YousignSigner {
  id: string;
  status: string;
  info: { first_name: string; last_name: string; email: string };
}

// Raw DealCrm row returned from $queryRaw for Yousign-related fields
interface DealCrmRaw {
  id: string;
  prospect_id: string;
  amount_eur: number | null;
  yousign_request_id: string | null;
  yousign_document_id: string | null;
  yousign_signer_id: string | null;
}

@Injectable()
export class YousignService {
  private readonly logger = new Logger(YousignService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly isSandbox: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.CSM_ONBOARDING) private readonly csmOnboardingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DEALMAKER_PIPELINE) private readonly dealmakerQueue: Queue,
  ) {
    this.apiKey = this.configService.get<string>('YOUSIGN_API_KEY', '');
    this.isSandbox = this.configService.get<string>('NODE_ENV', 'development') !== 'production';
    this.baseUrl = this.isSandbox
      ? 'https://api-sandbox.yousign.app/v3'
      : 'https://api.yousign.app/v3';

    if (!this.apiKey) {
      this.logger.warn('YOUSIGN_API_KEY not set — Yousign service unavailable');
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async createSignatureProcess(deal: Deal, quote: Quote): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn({ msg: 'Skipping signature process — no API key', dealId: deal.id });
      return;
    }

    this.logger.log({ msg: 'Starting Yousign signature process', dealId: deal.id });

    // 1. Generate contract PDF
    const pdfBuffer = await this.generateContractPdf(deal, quote);

    // 2. Create signature request
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);

    const signatureRequest = await this.createSignatureRequest({
      name: `Contrat — ${this.sanitize(deal.title)}`,
      expiration_date: expirationDate.toISOString(),
    });

    // 3. Upload document
    const document = await this.uploadDocument(signatureRequest.id, pdfBuffer, `contrat-${deal.id}.pdf`);

    // 4. Add signer
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: deal.prospectId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!prospect?.email) {
      this.logger.error({ msg: 'Cannot add signer — prospect has no email', dealId: deal.id });
      throw new Error(`Prospect ${deal.prospectId} has no email for signing`);
    }

    const signer = await this.addSigner(signatureRequest.id, {
      first_name: this.sanitize(prospect.firstName ?? 'Prospect'),
      last_name: this.sanitize(prospect.lastName ?? ''),
      email: prospect.email,
    });

    // 5. Add signature fields to document
    await this.addDocumentField(document.id, {
      type: 'signature',
      page: 1,
      x: 400,
      y: 700,
      width: 150,
      height: 50,
      signer_id: signer.id,
    });
    await this.addDocumentField(document.id, {
      type: 'mention',
      content: 'Lu et approuvé',
      page: 1,
      x: 200,
      y: 700,
      width: 200,
      height: 30,
      signer_id: signer.id,
    });

    // 6. Activate signature request
    await this.activateSignatureRequest(signatureRequest.id);

    // 7. Update DealCrm record — use raw query for new columns not in generated client
    const now = new Date().toISOString();
    await this.prisma.$executeRaw`
      UPDATE deals_crm
      SET stage = ${DealStage.SIGNATURE_EN_COURS},
          yousign_request_id = ${signatureRequest.id},
          yousign_document_id = ${document.id},
          yousign_signer_id = ${signer.id},
          contrat_envoye_at = ${now}::timestamptz,
          updated_at = NOW()
      WHERE id = ${deal.id}
    `;

    this.logger.log({ msg: 'Signature process activated', dealId: deal.id, signatureRequestId: signatureRequest.id });

    // 8. Schedule reminders: J+2, J+5, J+7
    for (const days of [2, 5, 7]) {
      await this.dealmakerQueue.add(
        'send-reminder',
        { action: 'send-reminder', dealId: deal.id },
        { delay: days * 24 * 60 * 60 * 1000 },
      );
    }
  }

  async handleWebhook(eventType: string, payload: Record<string, unknown>): Promise<void> {
    this.logger.log({ msg: 'Handling Yousign webhook', eventType });

    const eventId = (payload['id'] ?? (payload['data'] as Record<string, unknown> | undefined)?.['id'] ?? `${eventType}:${Date.now()}`) as string;
    const existing = await (this.prisma as any).webhookEvent.findFirst({ where: { provider: 'yousign', eventId } });
    if (existing) {
      this.logger.debug({ msg: 'Webhook already processed', eventId });
      return;
    }

    switch (eventType) {
      case 'signature_request.done':
        await this.onSignatureRequestDone(payload);
        break;
      case 'signature_request.expired':
        await this.onSignatureRequestExpired(payload);
        break;
      case 'signature_request.canceled':
        await this.onSignatureRequestCanceled(payload);
        break;
      case 'signer.done':
        await this.onSignerDone(payload);
        break;
      default:
        this.logger.debug({ msg: 'Unhandled Yousign webhook event', eventType });
    }

    await (this.prisma as any).webhookEvent.create({
      data: { provider: 'yousign', eventId, payload: JSON.stringify(payload), processedAt: new Date() },
    });
  }

  async dispatchToCSM(deal: Deal, contractUrl: string): Promise<void> {
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: deal.prospectId },
      select: { companyName: true },
    });

    const payload: DealToCSM = {
      dealId: deal.id,
      prospectId: deal.prospectId,
      companyName: prospect?.companyName ?? 'Unknown',
      mrrEur: deal.amountEur ?? 0,
      contractUrl,
    };

    await this.csmOnboardingQueue.add('onboard-customer', payload);
    this.logger.log({ msg: 'Dispatched deal to CSM onboarding', dealId: deal.id });
  }

  async generateContractPdf(deal: Deal, quote: Quote): Promise<Buffer> {
    const paymentTerms = (quote.amountHtEur ?? 0) >= 10_000 ? '30 / 40 / 30' : '50 / 50';

    const html = this.buildContractHtml({
      dealTitle: this.sanitize(deal.title),
      dealId: this.sanitize(deal.id),
      quoteNumber: this.sanitize(quote.quoteNumber),
      amountHtEur: quote.amountHtEur,
      tvaRate: quote.tvaRate,
      amountTtcEur: Math.round(quote.amountHtEur * (1 + quote.tvaRate) * 100) / 100,
      lineItems: quote.lineItems.map((item) => ({
        description: this.sanitize(item.description),
        quantity: item.quantity,
        unitPriceEur: item.unitPriceEur,
        totalEur: Math.round(item.quantity * item.unitPriceEur * 100) / 100,
      })),
      paymentTerms: this.sanitize(paymentTerms),
      contractDate: new Date().toLocaleDateString('fr-FR'),
    });

    // Use Puppeteer if available, otherwise return minimal fallback PDF
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        return Buffer.from(pdfBuffer);
      } finally {
        await browser.close();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ msg: 'Puppeteer unavailable, falling back to minimal PDF stub', error: message });
      // Minimal valid PDF stub for environments without Puppeteer
      return Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj' +
          ' 3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R>>endobj\nxref\n0 4\n' +
          '0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n' +
          'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF',
      );
    }
  }

  async downloadSignedDocument(signatureRequestId: string, documentId: string): Promise<Buffer> {
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}/documents/${encodeURIComponent(documentId)}/download`,
        {
          headers: this.authHeaders(),
          responseType: 'arraybuffer',
          timeout: 30_000,
        },
      ),
    );
    return Buffer.from(response.data as ArrayBuffer);
  }

  async sendReminder(signatureRequestId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}/renotify`,
        {},
        { headers: this.authHeaders(), timeout: 15_000 },
      ),
    );
    this.logger.log({ msg: 'Reminder sent', signatureRequestId });
  }

  async cancelSignature(signatureRequestId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.delete(
        `${this.baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}`,
        { headers: this.authHeaders(), timeout: 15_000 },
      ),
    );
    this.logger.log({ msg: 'Signature request canceled', signatureRequestId });
  }

  async getSignatureStatus(signatureRequestId: string): Promise<YousignSignatureRequest> {
    const response = await firstValueFrom(
      this.httpService.get<YousignSignatureRequest>(
        `${this.baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}`,
        { headers: this.authHeaders(), timeout: 15_000 },
      ),
    );
    return response.data;
  }

  // -------------------------------------------------------------------------
  // Private helpers — Yousign API calls
  // -------------------------------------------------------------------------

  private async createSignatureRequest(params: {
    name: string;
    expiration_date: string;
  }): Promise<YousignSignatureRequest> {
    const response = await firstValueFrom(
      this.httpService.post<YousignSignatureRequest>(
        `${this.baseUrl}/signature_requests`,
        { ...params, delivery_mode: 'email' },
        { headers: this.authHeaders(), timeout: 15_000 },
      ),
    );
    return response.data;
  }

  private async uploadDocument(signatureRequestId: string, pdfBuffer: Buffer, filename: string): Promise<YousignDocument> {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });
    form.append('nature', 'signable_document');

    const response = await firstValueFrom(
      this.httpService.post<YousignDocument>(
        `${this.baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}/documents`,
        form,
        {
          headers: { ...this.authHeaders(), ...form.getHeaders() },
          timeout: 30_000,
        },
      ),
    );
    return response.data;
  }

  private async addSigner(
    signatureRequestId: string,
    info: { first_name: string; last_name: string; email: string },
  ): Promise<YousignSigner> {
    const response = await firstValueFrom(
      this.httpService.post<YousignSigner>(
        `${this.baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}/signers`,
        {
          info,
          signature_authentication_mode: 'otp_email',
        },
        { headers: this.authHeaders(), timeout: 15_000 },
      ),
    );
    return response.data;
  }

  private async addDocumentField(documentId: string, field: Record<string, unknown>): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/documents/${encodeURIComponent(documentId)}/fields`,
        field,
        { headers: this.authHeaders(), timeout: 15_000 },
      ),
    );
  }

  private async activateSignatureRequest(signatureRequestId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}/activate`,
        {},
        { headers: this.authHeaders(), timeout: 15_000 },
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers — webhook handlers
  // -------------------------------------------------------------------------

  private async onSignatureRequestDone(payload: Record<string, unknown>): Promise<void> {
    const signatureRequestId = payload['signature_request_id'] as string | undefined;
    if (!signatureRequestId) {
      this.logger.error({ msg: 'signature_request.done missing signature_request_id' });
      return;
    }

    const deals = await this.prisma.$queryRaw<DealCrmRaw[]>`
      SELECT id, prospect_id, amount_eur, yousign_request_id, yousign_document_id, yousign_signer_id
      FROM deals_crm
      WHERE yousign_request_id = ${signatureRequestId}
      LIMIT 1
    `;
    const deal = deals[0];

    if (!deal) {
      this.logger.warn({ msg: 'No deal found for completed signature request', signatureRequestId });
      return;
    }

    // Download signed PDF
    let contractUrl = '';
    try {
      if (deal.yousign_document_id) {
        const signedPdf = await this.downloadSignedDocument(signatureRequestId, deal.yousign_document_id);
        // In production this should upload to S3/GCS — store a reference key for now
        contractUrl = `signed://${signatureRequestId}/${deal.yousign_document_id}`;
        this.logger.log({ msg: 'Signed PDF downloaded', sizeBytes: signedPdf.length, dealId: deal.id });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ msg: 'Failed to download signed PDF', signatureRequestId, error: message });
    }

    const now = new Date().toISOString();
    await this.prisma.$executeRaw`
      UPDATE deals_crm
      SET stage = ${DealStage.GAGNE},
          contrat_signe_url = ${contractUrl || null},
          date_signature = ${now}::timestamptz,
          closed_at = ${now}::timestamptz,
          won_reason = 'Contrat signé via Yousign',
          updated_at = NOW()
      WHERE id = ${deal.id}
    `;

    this.logger.log({ msg: 'Deal marked as GAGNE after signature', dealId: deal.id });
    this.eventEmitter.emit('deal.won', { dealId: deal.id, contractUrl });

    // Dispatch to CSM onboarding
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: deal.prospect_id },
      select: { companyName: true },
    });
    await this.csmOnboardingQueue.add('onboard-customer', {
      dealId: deal.id,
      prospectId: deal.prospect_id,
      companyName: prospect?.companyName ?? 'Unknown',
      mrrEur: deal.amount_eur ?? 0,
      contractUrl,
    });
  }

  private async onSignatureRequestExpired(payload: Record<string, unknown>): Promise<void> {
    const signatureRequestId = payload['signature_request_id'] as string | undefined;
    if (!signatureRequestId) return;

    const deals = await this.prisma.$queryRaw<DealCrmRaw[]>`
      SELECT id, prospect_id, amount_eur, yousign_request_id, yousign_document_id, yousign_signer_id
      FROM deals_crm
      WHERE yousign_request_id = ${signatureRequestId}
      LIMIT 1
    `;
    const deal = deals[0];
    if (!deal) return;

    await this.prisma.$executeRaw`
      UPDATE deals_crm
      SET stage = ${DealStage.NEGOCIATION}, updated_at = NOW()
      WHERE id = ${deal.id}
    `;

    this.logger.log({ msg: 'Signature expired — deal returned to NEGOCIATION', dealId: deal.id });
    this.eventEmitter.emit('deal.signature_expired', { dealId: deal.id, notifyJonathan: true });
  }

  private async onSignatureRequestCanceled(payload: Record<string, unknown>): Promise<void> {
    const signatureRequestId = payload['signature_request_id'] as string | undefined;
    const canceledBy = payload['canceled_by'] as string | undefined;
    if (!signatureRequestId) return;

    const deals = await this.prisma.$queryRaw<DealCrmRaw[]>`
      SELECT id, prospect_id, amount_eur, yousign_request_id, yousign_document_id, yousign_signer_id
      FROM deals_crm
      WHERE yousign_request_id = ${signatureRequestId}
      LIMIT 1
    `;
    const deal = deals[0];
    if (!deal) return;

    // Only mark as PERDU if prospect initiated the cancellation
    const isProspectInitiated = canceledBy === 'signer' || canceledBy === 'prospect';
    if (isProspectInitiated) {
      const now = new Date().toISOString();
      await this.prisma.$executeRaw`
        UPDATE deals_crm
        SET stage = ${DealStage.PERDU},
            closed_at = ${now}::timestamptz,
            lost_reason = 'Signature annulée par le prospect',
            lost_at = ${now}::timestamptz,
            updated_at = NOW()
        WHERE id = ${deal.id}
      `;
      this.logger.log({ msg: 'Signature canceled by prospect — deal marked PERDU', dealId: deal.id });
      this.eventEmitter.emit('deal.lost', { dealId: deal.id, reason: 'signature_canceled_by_prospect' });
    } else {
      this.logger.log({ msg: 'Signature canceled (not by prospect) — no stage change', dealId: deal.id, canceledBy });
    }
  }

  private async onSignerDone(payload: Record<string, unknown>): Promise<void> {
    const signatureRequestId = payload['signature_request_id'] as string | undefined;
    const signerId = payload['signer_id'] as string | undefined;
    if (!signatureRequestId) return;

    const deals = await this.prisma.$queryRaw<DealCrmRaw[]>`
      SELECT id, prospect_id, amount_eur, yousign_request_id, yousign_document_id, yousign_signer_id
      FROM deals_crm
      WHERE yousign_request_id = ${signatureRequestId}
      LIMIT 1
    `;
    const deal = deals[0];
    if (!deal) return;

    // Log activity using raw insert (deal_activities table may have different structure)
    await this.prisma.$executeRaw`
      INSERT INTO deal_activities (id, deal_id, type, details, created_at)
      VALUES (
        gen_random_uuid(),
        ${deal.id},
        'signer_completed',
        ${JSON.stringify({ signerId: signerId ?? 'unknown', message: 'Signataire a signé le document' })}::jsonb,
        NOW()
      )
    `;

    this.logger.log({ msg: 'Signer completed — activity logged', dealId: deal.id, signerId });
  }

  // -------------------------------------------------------------------------
  // Private helpers — utilities
  // -------------------------------------------------------------------------

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private sanitize(value: string): string {
    if (!value) return '';
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  private buildContractHtml(data: {
    dealTitle: string;
    dealId: string;
    quoteNumber: string;
    amountHtEur: number;
    tvaRate: number;
    amountTtcEur: number;
    lineItems: Array<{ description: string; quantity: number; unitPriceEur: number; totalEur: number }>;
    paymentTerms: string;
    contractDate: string;
  }): string {
    const lineItemRows = data.lineItems
      .map(
        (item) => `
        <tr>
          <td>${item.description}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${item.unitPriceEur.toLocaleString('fr-FR')} €</td>
          <td style="text-align:right">${item.totalEur.toLocaleString('fr-FR')} €</td>
        </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Contrat — ${data.dealTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 40px; }
    h1 { font-size: 20px; color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; }
    h2 { font-size: 15px; color: #16213e; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #1a1a2e; color: white; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
    .totals { margin-top: 20px; text-align: right; }
    .totals td { border: none; font-weight: bold; }
    .signature-area { margin-top: 80px; border-top: 1px solid #999; padding-top: 20px; }
    .footer { margin-top: 40px; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>
</head>
<body>
  <h1>CONTRAT DE PRESTATION DE SERVICES</h1>
  <p><strong>Référence devis :</strong> ${data.quoteNumber}</p>
  <p><strong>Objet :</strong> ${data.dealTitle}</p>
  <p><strong>Date :</strong> ${data.contractDate}</p>

  <h2>Prestations</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center">Quantité</th>
        <th style="text-align:right">Prix unitaire HT</th>
        <th style="text-align:right">Total HT</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemRows}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Total HT</td><td>${data.amountHtEur.toLocaleString('fr-FR')} €</td></tr>
    <tr><td>TVA (${(data.tvaRate * 100).toFixed(0)} %)</td><td>${(data.amountTtcEur - data.amountHtEur).toLocaleString('fr-FR')} €</td></tr>
    <tr><td><strong>Total TTC</strong></td><td><strong>${data.amountTtcEur.toLocaleString('fr-FR')} €</strong></td></tr>
  </table>

  <h2>Modalités de paiement</h2>
  <p>Échelonnement : <strong>${data.paymentTerms}</strong></p>

  <h2>Conditions générales</h2>
  <p>Le présent contrat est soumis au droit français. Tout litige sera de la compétence exclusive
  des tribunaux compétents. Le client déclare avoir pris connaissance des conditions générales de
  vente disponibles sur le site du prestataire et les accepte sans réserve.</p>

  <div class="signature-area">
    <p><strong>Signature du client :</strong></p>
    <p style="margin-top: 60px;">Lu et approuvé</p>
  </div>

  <div class="footer">
    <p>Réf. interne : ${data.dealId} | Document généré automatiquement</p>
  </div>
</body>
</html>`;
  }
}
