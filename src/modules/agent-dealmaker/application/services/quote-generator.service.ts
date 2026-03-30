import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { PricingService } from './pricing.service';

// Use string literals for DealStage because the Prisma client may not
// yet be regenerated with the full schema (pending migration).
const STAGE = {
  DEVIS_CREE: 'DEVIS_CREE',
  DEVIS_EN_CONSIDERATION: 'DEVIS_EN_CONSIDERATION',
  GAGNE: 'GAGNE',
  PERDU: 'PERDU',
} as const;

interface ScopeAnalysis {
  type_projet: string;
  tier_recommande: string;
  budget_estime: number;
  complexite: 'faible' | 'moyenne' | 'elevee';
  points_cles: string[];
}

const VALID_TYPES_PROJET = [
  'site_vitrine',
  'ecommerce_shopify',
  'app_flutter',
  'app_metier',
  'rgaa',
  'tracking_server_side',
];

@Injectable()
export class QuoteGeneratorService {
  private readonly logger = new Logger(QuoteGeneratorService.name);

  // Cast to any to use models not yet in the generated Prisma client
  private get db(): any {
    return this.prisma as any;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly emailAdapter: IEmailAdapter,
    private readonly pricingService: PricingService,
    private readonly configService: ConfigService,
  ) {}

  async generateQuote(dealId: string, prospectId: string): Promise<{ quoteId: string; trackingId: string }> {
    this.logger.log({ msg: 'Generating quote', dealId, prospectId });

    // Verify deal exists and is not closed
    const deal = await this.db.dealCrm.findUnique({
      where: { id: dealId },
      include: { prospect: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    if (deal.stage === STAGE.GAGNE || deal.stage === STAGE.PERDU) {
      throw new ConflictException(`Deal ${dealId} is already closed (${deal.stage as string})`);
    }

    // Verify no active quote already exists
    const existingQuote = await this.prisma.quote.findUnique({ where: { dealId } });
    if (existingQuote && existingQuote.status !== 'rejected' && existingQuote.status !== 'expired') {
      throw new ConflictException(`Deal ${dealId} already has an active quote`);
    }

    const prospect = deal.prospect as Record<string, unknown>;

    // Analyze scope via LLM
    const rdvNotes = (deal.rdvNotes as Record<string, unknown> | null) ?? null;
    const notesText = rdvNotes ? JSON.stringify(rdvNotes) : '';
    const besoinsText = (deal.typeProjet as string | null) ?? '';
    const scope = await this.analyzeScope(notesText, besoinsText);

    // Select pricing
    const tier = (deal.tierRecommande as string | null) ?? scope.tier_recommande;
    const typeProjet = (deal.typeProjet as string | null) ?? scope.type_projet;
    const pricing = this.pricingService.getPricingDetail(typeProjet, tier);

    // Generate quote number
    const quoteNumber = `QT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Create tracking pixel record
    const trackingRecord = await this.db.devisTracking.create({
      data: {
        devisId: dealId,
        pdfUrl: '',
        opens: 0,
      },
    });

    // Build template data (all sanitized)
    const sanitize = (s: string): string =>
      String(s)
        .replace(/[<>{}]/g, '')
        .slice(0, 500);

    const baseUrl = this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    const trackingPixelUrl = `${baseUrl}/api/dealmaker/tracking/${trackingRecord.id as string}/pixel.gif`;

    const templateData = {
      quoteNumber,
      prospectName: sanitize((prospect.fullName as string) ?? (prospect.companyName as string) ?? 'Client'),
      companyName: sanitize((prospect.companyName as string) ?? ''),
      dealTitle: sanitize(deal.title as string),
      typeProjet,
      tier,
      nomOffre: sanitize(pricing.nom),
      prixHt: pricing.prix,
      prixTtc: Math.round(pricing.prix * 1.2),
      features: pricing.features.map(sanitize),
      timelineWeeks: pricing.timeline,
      dateDevis: new Date().toLocaleDateString('fr-FR'),
      validityDays: 30,
      trackingPixelUrl,
      pointsCles: scope.points_cles.map(sanitize),
    };

    // Generate PDF
    await this.generatePdf(templateData);

    // Save quote to DB
    const amountHtEur = pricing.prix;
    const quote = await this.prisma.quote.create({
      data: {
        dealId,
        prospectId,
        quoteNumber,
        title: deal.title as string,
        amountHtEur,
        tvaRate: 0.2,
        lineItems: this.pricingService.generateLineItems(typeProjet, tier) as any,
        status: 'sent',
        validityDays: 30,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pdfGeneratedAt: new Date(),
      },
    });

    // Update tracking record with actual quote id
    await this.db.devisTracking.update({
      where: { id: trackingRecord.id as string },
      data: { devisId: quote.id },
    });

    // Send email with PDF attachment
    const senderEmail = this.configService.get<string>('AXIOM_SENDER_EMAIL') ?? 'contact@axiom-marketing.fr';
    const prospectEmail = prospect.email as string | undefined;
    if (prospectEmail) {
      await this.emailAdapter.sendEmail({
        from: senderEmail,
        to: [prospectEmail],
        subject: `Votre devis ${quoteNumber} — ${sanitize(deal.title as string)}`,
        htmlBody: this.buildEmailHtml(templateData),
        textBody: `Bonjour ${templateData.prospectName},\n\nVeuillez trouver ci-joint votre devis ${quoteNumber}.\n\nCordialement,\nAxiom Marketing`,
        headers: {
          'X-Quote-Id': quote.id,
          'X-Tracking-Id': trackingRecord.id as string,
        },
      });
    }

    // Advance deal stage to DEVIS_CREE
    const currentHistory = (deal.stageHistory as unknown[]) ?? [];
    await this.db.dealCrm.update({
      where: { id: dealId },
      data: {
        stage: STAGE.DEVIS_CREE,
        quoteId: quote.id,
        devisId: quote.id,
        devisEnvoyeAt: new Date(),
        trackingId: trackingRecord.id as string,
        stageHistory: [...currentHistory, { stage: STAGE.DEVIS_CREE, enteredAt: new Date() }],
      },
    });

    // Create deal activity
    await this.db.dealActivity.create({
      data: {
        dealId,
        type: 'devis_envoye',
        engagementDelta: 10,
        details: {
          quoteId: quote.id,
          quoteNumber,
          amountHtEur,
          typeProjet,
          tier,
        },
      },
    });

    this.logger.log({ msg: 'Quote generated and sent', dealId, quoteId: quote.id, trackingId: trackingRecord.id });
    return { quoteId: quote.id, trackingId: trackingRecord.id as string };
  }

  async analyzeScope(notes: string, besoins: string): Promise<ScopeAnalysis> {
    // Sanitize inputs: strip <>, {}, truncate to 2000
    const sanitizeInput = (s: string): string =>
      s.replace(/[<>{}]/g, '').slice(0, 2000);

    const sanitizedNotes = sanitizeInput(notes);
    const sanitizedBesoins = sanitizeInput(besoins);

    const fallback: ScopeAnalysis = {
      type_projet: 'site_vitrine',
      tier_recommande: 'silver',
      budget_estime: 5000,
      complexite: 'moyenne',
      points_cles: ['Projet web', 'Délai standard'],
    };

    try {
      const result = await this.llmService.call({
        task: LlmTask.ANALYZE_COMPANY_STRATEGY,
        systemPrompt: `Tu es un expert en avant-vente pour une agence digitale. Analyse le scope du projet et retourne un JSON strict avec exactement ces champs:
{
  "type_projet": string (one of: ${VALID_TYPES_PROJET.join(', ')}),
  "tier_recommande": string (one of: bronze, silver, gold),
  "budget_estime": number (EUR HT),
  "complexite": string (one of: faible, moyenne, elevee),
  "points_cles": string[] (max 5 items, each max 100 chars)
}
Retourne UNIQUEMENT le JSON, sans markdown ni explication.`,
        userPrompt: `Notes de RDV découverte:\n${sanitizedNotes}\n\nBesoins exprimés:\n${sanitizedBesoins}`,
        maxTokens: 512,
        temperature: 0.2,
      });

      const parsed = JSON.parse(result.content) as ScopeAnalysis;

      // Validate type_projet against whitelist
      if (!VALID_TYPES_PROJET.includes(parsed.type_projet)) {
        this.logger.warn({ msg: 'Invalid type_projet from LLM, using fallback', value: parsed.type_projet });
        parsed.type_projet = fallback.type_projet;
      }

      // Validate tier
      if (!['bronze', 'silver', 'gold'].includes(parsed.tier_recommande)) {
        parsed.tier_recommande = fallback.tier_recommande;
      }

      // Validate complexite
      if (!['faible', 'moyenne', 'elevee'].includes(parsed.complexite)) {
        parsed.complexite = fallback.complexite;
      }

      // Sanitize points_cles
      if (!Array.isArray(parsed.points_cles)) {
        parsed.points_cles = fallback.points_cles;
      } else {
        parsed.points_cles = parsed.points_cles
          .slice(0, 5)
          .map((p) => String(p).replace(/[<>{}]/g, '').slice(0, 100));
      }

      return parsed;
    } catch (err) {
      this.logger.warn({ msg: 'LLM scope analysis failed, using fallback', error: (err as Error).message });
      return fallback;
    }
  }

  async generatePdf(data: Record<string, unknown>): Promise<Buffer> {
    // Dynamic imports — puppeteer and handlebars must be installed at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Handlebars = require('handlebars') as typeof import('handlebars');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer') as { launch: (opts: Record<string, unknown>) => Promise<{
      newPage: () => Promise<{
        setContent: (html: string, opts: Record<string, unknown>) => Promise<void>;
        pdf: (opts: Record<string, unknown>) => Promise<Uint8Array>;
      }>;
      close: () => Promise<void>;
    }> };

    const templateSource = this.getHtmlTemplate();
    const template = Handlebars.compile(templateSource);
    const html = template(data);

    let browser: {
      newPage: () => Promise<{
        setContent: (html: string, opts: Record<string, unknown>) => Promise<void>;
        pdf: (opts: Record<string, unknown>) => Promise<Uint8Array>;
      }>;
      close: () => Promise<void>;
    } | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async handleTrackingPixel(
    trackingId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<Buffer> {
    // Anonymize IP: keep only first 3 octets for IPv4
    const anonymizeIp = (rawIp?: string): string | undefined => {
      if (!rawIp) return undefined;
      const parts = rawIp.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
      }
      if (rawIp.includes(':')) {
        const groups = rawIp.split(':');
        return groups.slice(0, 3).join(':') + ':0000:0000:0000:0000:0000';
      }
      return undefined;
    };

    const tracking = await this.db.devisTracking.findUnique({ where: { id: trackingId } });
    if (!tracking) {
      return this.getTransparentGifBuffer();
    }

    // Record open event
    await this.db.devisOpen.create({
      data: {
        trackingId,
        ipAddress: anonymizeIp(ip),
        userAgent: userAgent ? userAgent.slice(0, 256) : undefined,
      },
    });

    const newOpens = (tracking.opens as number) + 1;
    await this.db.devisTracking.update({
      where: { id: trackingId },
      data: { opens: newOpens, lastOpenedAt: new Date() },
    });

    // If >= 2 opens, advance deal to DEVIS_EN_CONSIDERATION
    if (newOpens >= 2) {
      const deal = await this.db.dealCrm.findFirst({
        where: { trackingId },
      });

      if (deal && (deal.stage as string) === STAGE.DEVIS_CREE) {
        const currentHistory = (deal.stageHistory as unknown[]) ?? [];
        await this.db.dealCrm.update({
          where: { id: deal.id as string },
          data: {
            stage: STAGE.DEVIS_EN_CONSIDERATION,
            stageHistory: [
              ...currentHistory,
              { stage: STAGE.DEVIS_EN_CONSIDERATION, enteredAt: new Date() },
            ],
          },
        });

        await this.db.dealActivity.create({
          data: {
            dealId: deal.id as string,
            type: 'devis_lu_multiple',
            engagementDelta: 15,
            details: { opens: newOpens, trackingId },
          },
        });

        this.logger.log({
          msg: 'Deal advanced to DEVIS_EN_CONSIDERATION',
          dealId: deal.id as string,
          opens: newOpens,
        });
      }
    }

    return this.getTransparentGifBuffer();
  }

  private getTransparentGifBuffer(): Buffer {
    // 1x1 transparent GIF (43 bytes)
    return Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    );
  }

  private buildEmailHtml(data: {
    quoteNumber: string;
    prospectName: string;
    dealTitle: string;
    nomOffre: string;
    prixHt: number;
    timelineWeeks: number;
    trackingPixelUrl: string;
  }): string {
    return `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a1a2e;">Votre devis ${data.quoteNumber}</h2>
  <p>Bonjour ${data.prospectName},</p>
  <p>Suite à notre échange, veuillez trouver ci-joint votre devis pour <strong>${data.dealTitle}</strong>.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr style="background: #f5f5f5;">
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Offre</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd;">${data.nomOffre}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Montant HT</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd;">${data.prixHt.toLocaleString('fr-FR')} €</td>
    </tr>
    <tr style="background: #f5f5f5;">
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Délai</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd;">${data.timelineWeeks} semaines</td>
    </tr>
  </table>
  <p>Ce devis est valable 30 jours. N'hésitez pas à nous contacter pour toute question.</p>
  <p>Cordialement,<br/><strong>Axiom Marketing</strong></p>
  <img src="${data.trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />
</body>
</html>`;
  }

  private getHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 40px; }
  .header { background: #1a1a2e; color: white; padding: 30px; margin-bottom: 30px; }
  .header h1 { margin: 0; font-size: 24px; }
  .header p { margin: 5px 0 0; opacity: 0.8; }
  .section { margin-bottom: 25px; }
  .section h2 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a2e; color: white; padding: 10px; text-align: left; }
  td { padding: 10px; border: 1px solid #ddd; }
  tr:nth-child(even) { background: #f9f9f9; }
  .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 15px; }
  .features li { margin: 5px 0; }
  .footer { margin-top: 40px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px; }
  .validity { background: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; margin: 20px 0; }
</style>
</head>
<body>
  <div class="header">
    <h1>DEVIS {{quoteNumber}}</h1>
    <p>{{dateDevis}} — Valable {{validityDays}} jours</p>
  </div>

  <div class="section">
    <h2>Client</h2>
    <p><strong>{{prospectName}}</strong>{{#if companyName}} — {{companyName}}{{/if}}</p>
  </div>

  <div class="section">
    <h2>Objet de la mission</h2>
    <p>{{dealTitle}}</p>
    {{#if pointsCles}}
    <ul class="features">
      {{#each pointsCles}}<li>{{this}}</li>{{/each}}
    </ul>
    {{/if}}
  </div>

  <div class="section">
    <h2>Offre proposée : {{nomOffre}}</h2>
    <table>
      <thead>
        <tr>
          <th>Prestation</th>
          <th>Inclus</th>
          <th>Délai</th>
          <th>Prix HT</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{{typeProjet}} — {{tier}}</td>
          <td>
            <ul class="features">
              {{#each features}}<li>{{this}}</li>{{/each}}
            </ul>
          </td>
          <td>{{timelineWeeks}} semaines</td>
          <td>{{prixHt}} €</td>
        </tr>
      </tbody>
    </table>
    <div class="total">
      <p>Total HT : {{prixHt}} €</p>
      <p>Total TTC : {{prixTtc}} €</p>
    </div>
  </div>

  <div class="validity">
    Ce devis est valable 30 jours à compter du {{dateDevis}}.
  </div>

  <div class="footer">
    <p>Axiom Marketing — contact@axiom-marketing.fr</p>
    <p>Ce document est confidentiel et destiné exclusivement au destinataire mentionné.</p>
  </div>
  <img src="{{trackingPixelUrl}}" width="1" height="1" alt="" />
</body>
</html>`;
  }
}
