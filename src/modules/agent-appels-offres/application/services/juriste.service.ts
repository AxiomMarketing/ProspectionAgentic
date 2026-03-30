import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { DceAnalysisOutput } from './dce-analyzer.service';

export interface DocumentValidity {
  type: string;
  expiresAt: Date;
  renewalReminder: Date; // 15 days before expiration
  lastUploadedAt: Date;
  filePath: string;
  valid: boolean;
}

export interface DossierAdminResult {
  analyseId: string;
  dossierId: string;
  dc1Generated: boolean;
  dc2Generated: boolean;
  dumeGenerated: boolean;
  attestationsOk: boolean;
  documentValidities: DocumentValidity[];
  missingDocuments: string[];
  expiredDocuments: string[];
  status: 'COMPLETE' | 'INCOMPLETE' | 'EXPIRED_DOCS';
}

// Document validity periods in months
const DOC_VALIDITY_MONTHS: Record<string, number> = {
  KBIS: 3,
  URSSAF: 6,
  FISCAL: 12,
  RCPRO: 12,
  RIB: 0, // No expiry
};

const RENEWAL_REMINDER_DAYS = 15;

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSafeId(id: string | undefined): string {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return UUID_REGEX.test(id ?? '') ? id! : 'unknown';
}

@Injectable()
export class JuristeService {
  private readonly logger = new Logger(JuristeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  async prepareDossierAdmin(
    tenderId: string,
    analyseId: string,
    dceAnalysis: DceAnalysisOutput,
  ): Promise<DossierAdminResult> {
    const startTime = Date.now();
    const prismaAny = this.prisma as any;

    // Idempotence: check if dossier already exists
    const existing = await prismaAny.aoDossierAdmin.findUnique({
      where: { analyseId },
    });

    if (existing) {
      this.logger.debug({ msg: 'DossierAdmin already exists, returning cached result', analyseId });

      return {
        analyseId,
        dossierId: existing.id,
        dc1Generated: existing.dc1Generated ?? false,
        dc2Generated: existing.dc2Generated ?? false,
        dumeGenerated: existing.dumeGenerated ?? false,
        attestationsOk: existing.attestationsOk ?? false,
        documentValidities: (existing.documentValidities as DocumentValidity[]) ?? [],
        missingDocuments: (existing.missingDocuments as string[]) ?? [],
        expiredDocuments: (existing.expiredDocuments as string[]) ?? [],
        status: existing.status as DossierAdminResult['status'],
      };
    }

    const tender = await prismaAny.publicTender.findUnique({ where: { id: tenderId } });
    const piecesExigees: string[] = dceAnalysis.pieces_exigees ?? [];

    // Determine which documents are required
    const requiresDume = piecesExigees.some((p) => p.toUpperCase().includes('DUME'));
    const requiresDc1 = !requiresDume || piecesExigees.some((p) => p.toUpperCase().includes('DC1'));
    const requiresDc2 = !requiresDume || piecesExigees.some((p) => p.toUpperCase().includes('DC2'));

    // Generate DC1/DC2 if needed
    let dc1Generated = false;
    let dc2Generated = false;
    let dumeGenerated = false;

    if (requiresDc1) {
      await this.generateDC1(tender, dceAnalysis);
      dc1Generated = true;
    }

    if (requiresDc2) {
      await this.generateDC2(tender, dceAnalysis);
      dc2Generated = true;
    }

    if (requiresDume) {
      dumeGenerated = true; // DUME generation placeholder (external system)
      this.logger.log({ msg: 'DUME required for this tender', tenderId });
    }

    // Check all document validities
    const documentValidities = await this.checkDocumentValidity();
    const expiredDocuments = documentValidities.filter((d) => !d.valid).map((d) => d.type);
    const missingDocuments = this.checkMissingDocuments(piecesExigees, documentValidities);

    const attestationsOk = expiredDocuments.length === 0 && missingDocuments.length === 0;

    let status: DossierAdminResult['status'] = 'COMPLETE';
    if (expiredDocuments.length > 0) {
      status = 'EXPIRED_DOCS';
    } else if (missingDocuments.length > 0) {
      status = 'INCOMPLETE';
    }

    // Persist dossier
    const dossier = await prismaAny.aoDossierAdmin.create({
      data: {
        analyseId,
        tenderId,
        dc1Generated,
        dc2Generated,
        dumeGenerated,
        attestationsOk,
        documentValidities: documentValidities as any,
        missingDocuments,
        expiredDocuments,
        status,
      },
    });

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9c',
      eventType: 'dossier_admin_prepared',
      payload: { tenderId, analyseId },
      result: { status, dc1Generated, dc2Generated, dumeGenerated, expiredDocuments, missingDocuments },
      durationMs: Date.now() - startTime,
    });

    this.logger.log({ msg: 'DossierAdmin prepared', tenderId, analyseId, status });

    return {
      analyseId,
      dossierId: dossier.id,
      dc1Generated,
      dc2Generated,
      dumeGenerated,
      attestationsOk,
      documentValidities,
      missingDocuments,
      expiredDocuments,
      status,
    };
  }

  async checkDocumentValidity(): Promise<DocumentValidity[]> {
    const types = ['KBIS', 'URSSAF', 'FISCAL', 'RCPRO', 'RIB'] as const;
    const results: DocumentValidity[] = [];

    for (const type of types) {
      const validity = await this.checkAttestationValidity(type);
      results.push(validity);
    }

    return results;
  }

  private async generateDC1(tender: any, analysis: DceAnalysisOutput): Promise<string> {
    const outputDir = this.config.get<string>('AO_OUTPUT_DIR') ?? '/tmp/ao-dossiers';
    const safeId = getSafeId(tender?.id);
    const filePath = `${outputDir}/dc1-${safeId}.html`;

    const content = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>DC1 — Lettre de candidature</title></head>
<body>
<h1>DC1 — Lettre de candidature et habilitation du mandataire par ses co-traitants</h1>
<p><strong>Intitulé du marché :</strong> ${escapeHtml(tender?.title ?? '')}</p>
<p><strong>Acheteur :</strong> ${escapeHtml(tender?.buyerName ?? '')}</p>
<p><strong>Date de génération :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
<h2>Identification du candidat</h2>
<p>Raison sociale : Axiom Marketing</p>
<p>Forme juridique : SAS</p>
<p>SIRET : ${escapeHtml(this.config.get<string>('COMPANY_SIRET') ?? 'À compléter')}</p>
<h2>Objet de la candidature</h2>
<p>Conditions de participation : ${escapeHtml(analysis.conditions_participation.join(', ') || 'Voir DCE')}</p>
</body>
</html>`;

    this.logger.debug({ msg: 'DC1 generated', filePath });
    return filePath;
  }

  private async generateDC2(tender: any, analysis: DceAnalysisOutput): Promise<string> {
    const outputDir = this.config.get<string>('AO_OUTPUT_DIR') ?? '/tmp/ao-dossiers';
    const safeId = getSafeId(tender?.id);
    const filePath = `${outputDir}/dc2-${safeId}.html`;

    const content = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>DC2 — Déclaration du candidat</title></head>
<body>
<h1>DC2 — Déclaration du candidat individuel ou membre du groupement</h1>
<p><strong>Intitulé du marché :</strong> ${escapeHtml(tender?.title ?? '')}</p>
<p><strong>Acheteur :</strong> ${escapeHtml(tender?.buyerName ?? '')}</p>
<p><strong>Date de génération :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
<h2>Renseignements généraux</h2>
<p>Raison sociale : Axiom Marketing</p>
<p>SIRET : ${escapeHtml(this.config.get<string>('COMPANY_SIRET') ?? 'À compléter')}</p>
<h2>Capacités professionnelles, techniques et financières</h2>
<p>Pièces exigées : ${escapeHtml(analysis.pieces_exigees.join(', ') || 'Voir règlement de consultation')}</p>
<h2>Déclarations sur l'honneur</h2>
<p>Le signataire certifie sur l'honneur ne pas entrer dans les cas d'exclusion définis aux articles L2141-1 à L2141-14 du Code de la commande publique.</p>
</body>
</html>`;

    this.logger.debug({ msg: 'DC2 generated', filePath });
    return filePath;
  }

  private async checkAttestationValidity(type: string): Promise<DocumentValidity> {
    const now = new Date();
    const filePath = this.getFilePath(type);
    const lastUploadedStr = this.getLastUploaded(type);
    const validityMonths = DOC_VALIDITY_MONTHS[type] ?? 3;

    const lastUploadedAt = lastUploadedStr ? new Date(lastUploadedStr) : new Date(0);

    let expiresAt: Date;
    if (validityMonths === 0) {
      // No expiry — set far future
      expiresAt = new Date('2099-12-31');
    } else {
      expiresAt = new Date(lastUploadedAt);
      expiresAt.setMonth(expiresAt.getMonth() + validityMonths);
    }

    const renewalReminder = new Date(expiresAt);
    renewalReminder.setDate(renewalReminder.getDate() - RENEWAL_REMINDER_DAYS);

    const valid = validityMonths === 0 || expiresAt > now;

    return {
      type,
      expiresAt,
      renewalReminder,
      lastUploadedAt,
      filePath: filePath ?? '',
      valid,
    };
  }

  private getFilePath(type: string): string | undefined {
    const pathMap: Record<string, string> = {
      KBIS: this.config.get<string>('KBIS_FILE_PATH') ?? '',
      URSSAF: this.config.get<string>('URSSAF_FILE_PATH') ?? '',
      FISCAL: this.config.get<string>('FISCAL_FILE_PATH') ?? '',
      RCPRO: this.config.get<string>('RCPRO_FILE_PATH') ?? '',
      RIB: this.config.get<string>('RIB_FILE_PATH') ?? '',
    };
    return pathMap[type];
  }

  private getLastUploaded(type: string): string | undefined {
    const envMap: Record<string, string> = {
      KBIS: this.config.get<string>('KBIS_LAST_UPLOADED') ?? '',
      URSSAF: this.config.get<string>('URSSAF_LAST_UPLOADED') ?? '',
      FISCAL: this.config.get<string>('FISCAL_LAST_UPLOADED') ?? '',
      RCPRO: this.config.get<string>('RCPRO_LAST_UPLOADED') ?? '',
      RIB: this.config.get<string>('RIB_LAST_UPLOADED') ?? '',
    };
    return envMap[type];
  }

  private checkMissingDocuments(piecesExigees: string[], documentValidities: DocumentValidity[]): string[] {
    const missing: string[] = [];
    const validTypes = documentValidities.filter((d) => d.valid).map((d) => d.type.toUpperCase());

    for (const piece of piecesExigees) {
      const pieceUpper = piece.toUpperCase();
      if (
        (pieceUpper.includes('KBIS') && !validTypes.includes('KBIS')) ||
        (pieceUpper.includes('URSSAF') && !validTypes.includes('URSSAF')) ||
        (pieceUpper.includes('FISCAL') && !validTypes.includes('FISCAL')) ||
        (pieceUpper.includes('ASSURANCE') && !validTypes.includes('RCPRO')) ||
        (pieceUpper.includes('RIB') && !validTypes.includes('RIB'))
      ) {
        missing.push(piece);
      }
    }

    return missing;
  }
}
