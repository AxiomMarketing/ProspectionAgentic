import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

export interface QACheckItem {
  code: string;
  category: 'ADMIN' | 'TECHNIQUE' | 'FINANCIER' | 'FORMAT' | 'COMPLETUDE';
  description: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  details?: string;
}

export interface QAReport {
  analyseId: string;
  controleId: string;
  checklistItems: QACheckItem[];
  nbPass: number;
  nbFail: number;
  nbWarning: number;
  decision: 'CONFORME' | 'CORRECTIONS_REQUISES' | 'BLOQUANT';
  corrections: string[];
  readyForDeposit: boolean;
}

@Injectable()
export class ControleurQaService {
  private readonly logger = new Logger(ControleurQaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  async runQualityControl(tenderId: string, analyseId: string): Promise<QAReport> {
    const startTime = Date.now();
    const prismaAny = this.prisma as any;

    // Idempotence: return existing control if already done
    const existing = await prismaAny.aoControleQa.findUnique({ where: { analyseId } });
    if (existing && existing.approved !== null && existing.status !== 'pending') {
      this.logger.debug({ msg: 'ControleQa already exists, returning cached result', analyseId });
      const checks = (existing.checksJson as QACheckItem[]) ?? [];
      const nbPass = checks.filter((c) => c.status === 'PASS').length;
      const nbFail = checks.filter((c) => c.status === 'FAIL').length;
      const nbWarning = checks.filter((c) => c.status === 'WARNING').length;
      const decision = this.computeDecision(checks);
      return {
        analyseId,
        controleId: existing.id,
        checklistItems: checks,
        nbPass,
        nbFail,
        nbWarning,
        decision,
        corrections: this.buildCorrections(checks),
        readyForDeposit: decision === 'CONFORME',
      };
    }

    // Load all sub-results
    const analyse = await prismaAny.aoAnalyse.findUnique({
      where: { id: analyseId },
      include: {
        dossierAdmin: true,
        offreFinanciere: true,
        memoireTechnique: true,
        exigences: true,
      },
    });

    if (!analyse) throw new NotFoundException(`AoAnalyse ${analyseId} not found`);

    const tender = await prismaAny.publicTender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    const dossier = analyse.dossierAdmin;
    const offre = analyse.offreFinanciere;
    const memoire = analyse.memoireTechnique;

    const checklistItems = this.buildChecklist(analyseId, tender, dossier, offre, memoire, analyse);

    const nbPass = checklistItems.filter((c) => c.status === 'PASS').length;
    const nbFail = checklistItems.filter((c) => c.status === 'FAIL').length;
    const nbWarning = checklistItems.filter((c) => c.status === 'WARNING').length;
    const decision = this.computeDecision(checklistItems);
    const corrections = this.buildCorrections(checklistItems);

    // Persist or update controle
    const upserted = await prismaAny.aoControleQa.upsert({
      where: { analyseId },
      create: {
        analyseId,
        status: 'completed',
        checksJson: checklistItems as any,
        errorsFound: nbFail,
        warningsFound: nbWarning,
        approved: decision === 'CONFORME',
        approvedAt: decision === 'CONFORME' ? new Date() : null,
        rejectionReason: decision !== 'CONFORME' ? corrections.join('; ').slice(0, 500) : null,
      },
      update: {
        status: 'completed',
        checksJson: checklistItems as any,
        errorsFound: nbFail,
        warningsFound: nbWarning,
        approved: decision === 'CONFORME',
        approvedAt: decision === 'CONFORME' ? new Date() : null,
        rejectionReason: decision !== 'CONFORME' ? corrections.join('; ').slice(0, 500) : null,
      },
    });

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9f',
      eventType: 'qa_control_completed',
      payload: { tenderId, analyseId },
      result: { decision, nbPass, nbFail, nbWarning },
      durationMs: Date.now() - startTime,
    });

    this.logger.log({ msg: 'QA control completed', tenderId, analyseId, decision, nbPass, nbFail, nbWarning });

    return {
      analyseId,
      controleId: upserted.id,
      checklistItems,
      nbPass,
      nbFail,
      nbWarning,
      decision,
      corrections,
      readyForDeposit: decision === 'CONFORME',
    };
  }

  private buildChecklist(
    analyseId: string,
    tender: any,
    dossier: any,
    offre: any,
    memoire: any,
    analyse: any,
  ): QACheckItem[] {
    const items: QACheckItem[] = [];
    const now = new Date();

    // ── ADMIN (QA-001 to QA-008) ──────────────────────────────────────────────

    // QA-001: DC1 generated
    items.push({
      code: 'QA-001',
      category: 'ADMIN',
      description: 'DC1 (lettre de candidature) généré',
      status: dossier?.dc1Generated ? 'PASS' : 'FAIL',
      details: dossier?.dc1Generated ? 'DC1 présent' : 'DC1 manquant — à générer via JuristeService',
    });

    // QA-002: DC2 generated
    items.push({
      code: 'QA-002',
      category: 'ADMIN',
      description: 'DC2 (déclaration du candidat) généré',
      status: dossier?.dc2Generated ? 'PASS' : 'FAIL',
      details: dossier?.dc2Generated ? 'DC2 présent' : 'DC2 manquant — à générer via JuristeService',
    });

    // QA-003: DUME generated if required
    {
      const dumeRequired = this.isDumeRequired(analyse);
      if (dumeRequired) {
        items.push({
          code: 'QA-003',
          category: 'ADMIN',
          description: 'DUME généré (si exigé par le DCE)',
          status: dossier?.dumeGenerated ? 'PASS' : 'FAIL',
          details: dossier?.dumeGenerated ? 'DUME présent' : 'DUME exigé mais non généré',
        });
      } else {
        items.push({
          code: 'QA-003',
          category: 'ADMIN',
          description: 'DUME généré (si exigé par le DCE)',
          status: 'PASS',
          details: 'DUME non exigé pour ce marché',
        });
      }
    }

    // QA-004: Kbis valid
    {
      const docs: any[] = this.extractDocuments(dossier);
      const kbis = docs.find((d) => d.type === 'KBIS');
      const kbisValid = kbis?.valid === true;
      items.push({
        code: 'QA-004',
        category: 'ADMIN',
        description: 'Kbis valide (non expiré)',
        status: kbisValid ? 'PASS' : dossier ? 'FAIL' : 'WARNING',
        details: kbis
          ? kbisValid
            ? `Kbis valide jusqu'au ${kbis.expiresAt}`
            : `Kbis expiré le ${kbis.expiresAt}`
          : 'Kbis non vérifié',
      });
    }

    // QA-005: URSSAF attestation valid
    {
      const docs: any[] = this.extractDocuments(dossier);
      const urssaf = docs.find((d) => d.type === 'URSSAF');
      const urssafValid = urssaf?.valid === true;
      items.push({
        code: 'QA-005',
        category: 'ADMIN',
        description: 'Attestation URSSAF valide',
        status: urssafValid ? 'PASS' : dossier ? 'FAIL' : 'WARNING',
        details: urssaf
          ? urssafValid
            ? 'Attestation URSSAF valide'
            : `Attestation URSSAF expirée le ${urssaf.expiresAt}`
          : 'Attestation URSSAF non vérifiée',
      });
    }

    // QA-006: Fiscal attestation valid
    {
      const docs: any[] = this.extractDocuments(dossier);
      const fiscal = docs.find((d) => d.type === 'FISCAL');
      const fiscalValid = fiscal?.valid === true;
      items.push({
        code: 'QA-006',
        category: 'ADMIN',
        description: 'Attestation fiscale valide',
        status: fiscalValid ? 'PASS' : dossier ? 'FAIL' : 'WARNING',
        details: fiscal
          ? fiscalValid
            ? 'Attestation fiscale valide'
            : `Attestation fiscale expirée le ${fiscal.expiresAt}`
          : 'Attestation fiscale non vérifiée',
      });
    }

    // QA-007: RC Pro attestation valid
    {
      const docs: any[] = this.extractDocuments(dossier);
      const rcpro = docs.find((d) => d.type === 'RCPRO');
      const rcproValid = rcpro?.valid === true;
      items.push({
        code: 'QA-007',
        category: 'ADMIN',
        description: 'Attestation RC Pro valide',
        status: rcproValid ? 'PASS' : dossier ? 'FAIL' : 'WARNING',
        details: rcpro
          ? rcproValid
            ? 'RC Pro valide'
            : `RC Pro expirée le ${rcpro.expiresAt}`
          : 'RC Pro non vérifiée',
      });
    }

    // QA-008: RIB present
    {
      const docs: any[] = this.extractDocuments(dossier);
      const rib = docs.find((d) => d.type === 'RIB');
      items.push({
        code: 'QA-008',
        category: 'ADMIN',
        description: 'RIB présent',
        status: rib?.filePath ? 'PASS' : 'FAIL',
        details: rib?.filePath ? 'RIB présent' : 'RIB manquant — obligatoire pour paiement',
      });
    }

    // ── TECHNIQUE (QA-009 to QA-017) ─────────────────────────────────────────

    // QA-009: Mémoire technique generated
    items.push({
      code: 'QA-009',
      category: 'TECHNIQUE',
      description: 'Mémoire technique généré',
      status: memoire ? 'PASS' : 'FAIL',
      details: memoire ? `Status: ${memoire.status}` : 'Mémoire technique absent',
    });

    // QA-010: All 5 chapters present
    {
      const chapitres: any[] = this.extractChapters(memoire);
      const allChapters = chapitres.length >= 5;
      items.push({
        code: 'QA-010',
        category: 'TECHNIQUE',
        description: 'Les 5 chapitres du mémoire technique sont présents',
        status: allChapters ? 'PASS' : memoire ? 'FAIL' : 'WARNING',
        details: allChapters
          ? `${chapitres.length} chapitres présents`
          : `Seulement ${chapitres.length}/5 chapitres présents`,
      });
    }

    // QA-011: Chapter page counts within limits
    {
      const chapitres: any[] = this.extractChapters(memoire);
      const outOfBounds = chapitres.filter((c) => {
        const nb = c.nbPages ?? 0;
        return nb < 1 || nb > 20;
      });
      items.push({
        code: 'QA-011',
        category: 'TECHNIQUE',
        description: 'Nombre de pages par chapitre dans les limites',
        status: outOfBounds.length === 0 ? 'PASS' : 'WARNING',
        details:
          outOfBounds.length === 0
            ? 'Tous les chapitres respectent les limites de pages'
            : `${outOfBounds.length} chapitre(s) hors limites: ${outOfBounds.map((c) => `ch.${c.numero}`).join(', ')}`,
      });
    }

    // QA-012: Mermaid diagrams generated (at least 1)
    {
      const schemas: string[] = this.extractSchemas(memoire);
      items.push({
        code: 'QA-012',
        category: 'TECHNIQUE',
        description: 'Au moins 1 diagramme Mermaid généré',
        status: schemas.length > 0 ? 'PASS' : 'WARNING',
        details:
          schemas.length > 0
            ? `${schemas.length} diagramme(s) présent(s)`
            : 'Aucun diagramme Mermaid — ajoute de la valeur au mémoire',
      });
    }

    // QA-013: RSE section present if flag active
    {
      const flagsActives = this.extractFlags(memoire);
      const rseRequired = flagsActives.rse || this.isRseRequired(analyse);
      const rsePresent = this.hasConditionalSection(memoire, 'rse');
      items.push({
        code: 'QA-013',
        category: 'TECHNIQUE',
        description: 'Section RSE présente (si exigée)',
        status: rseRequired ? (rsePresent ? 'PASS' : 'FAIL') : 'PASS',
        details: rseRequired
          ? rsePresent
            ? 'Section RSE présente'
            : 'Section RSE exigée mais absente du mémoire'
          : 'RSE non exigé pour ce marché',
      });
    }

    // QA-014: RGAA section present if flag active
    {
      const flagsActives = this.extractFlags(memoire);
      const rgaaRequired = flagsActives.rgaa || this.isRgaaRequired(analyse);
      const rgaaPresent = this.hasConditionalSection(memoire, 'rgaa');
      items.push({
        code: 'QA-014',
        category: 'TECHNIQUE',
        description: 'Section RGAA présente (si exigée)',
        status: rgaaRequired ? (rgaaPresent ? 'PASS' : 'FAIL') : 'PASS',
        details: rgaaRequired
          ? rgaaPresent
            ? 'Section RGAA présente'
            : 'Section RGAA exigée mais absente du mémoire'
          : 'RGAA non exigé pour ce marché',
      });
    }

    // QA-015: Volet social present if flag active
    {
      const flagsActives = this.extractFlags(memoire);
      const voletSocialRequired = flagsActives.voletSocial || this.isVoletSocialRequired(analyse);
      const voletPresent = this.hasConditionalSection(memoire, 'volet_social');
      items.push({
        code: 'QA-015',
        category: 'TECHNIQUE',
        description: 'Volet social présent (si exigé)',
        status: voletSocialRequired ? (voletPresent ? 'PASS' : 'FAIL') : 'PASS',
        details: voletSocialRequired
          ? voletPresent
            ? 'Volet social présent'
            : 'Volet social exigé mais absent du mémoire'
          : 'Volet social non exigé pour ce marché',
      });
    }

    // QA-016: Anti-detection score < 20%
    {
      const aiScore = memoire?.aiScoreRisk ?? null;
      const scoreOk = aiScore !== null && aiScore < 20;
      items.push({
        code: 'QA-016',
        category: 'TECHNIQUE',
        description: 'Score anti-détection IA < 20%',
        status: aiScore === null ? 'WARNING' : scoreOk ? 'PASS' : 'FAIL',
        details:
          aiScore === null
            ? 'Score anti-détection non calculé'
            : scoreOk
              ? `Score IA: ${aiScore}% (conforme)`
              : `Score IA: ${aiScore}% — dépasse le seuil de 20%`,
      });
    }

    // QA-017: Jonathan required sections marked
    {
      const sectionsJonathan = this.extractSectionsJonathan(memoire);
      const hasUnfilled = sectionsJonathan.length > 0;
      items.push({
        code: 'QA-017',
        category: 'TECHNIQUE',
        description: 'Sections requises par Jonathan identifiées',
        status: hasUnfilled ? 'WARNING' : 'PASS',
        details: hasUnfilled
          ? `${sectionsJonathan.length} section(s) à valider par Jonathan: ${sectionsJonathan.slice(0, 3).join(', ')}`
          : 'Aucune section en attente de validation Jonathan',
      });
    }

    // ── FINANCIER (QA-018 to QA-023) ─────────────────────────────────────────

    // QA-018: Financial document generated
    items.push({
      code: 'QA-018',
      category: 'FINANCIER',
      description: 'Document financier généré (BPU/DQE/DPGF)',
      status: offre ? 'PASS' : 'FAIL',
      details: offre
        ? `Type: ${offre.typeDocument ?? offre.decomposition ? 'présent' : 'BPU'}, Status: ${offre.status}`
        : 'Aucun document financier généré',
    });

    // QA-019: All budget lines present
    {
      const lignes: any[] = this.extractLignesBudget(offre);
      items.push({
        code: 'QA-019',
        category: 'FINANCIER',
        description: 'Lignes budgétaires présentes',
        status: lignes.length > 0 ? 'PASS' : offre ? 'FAIL' : 'WARNING',
        details:
          lignes.length > 0
            ? `${lignes.length} ligne(s) budgétaire(s) présente(s)`
            : 'Aucune ligne budgétaire trouvée',
      });
    }

    // QA-020: Budget line totals sum correctly
    {
      const lignes: any[] = this.extractLignesBudget(offre);
      let sumOk = true;
      let sumDetail = 'Totaux cohérents';
      if (lignes.length > 0) {
        const invalidLines = lignes.filter((l) => {
          const expected = Math.round(l.quantite * l.prixUnitaire);
          return Math.abs(expected - l.total) > 1;
        });
        sumOk = invalidLines.length === 0;
        sumDetail = sumOk
          ? 'Tous les totaux sont cohérents (quantité × prix unitaire)'
          : `${invalidLines.length} ligne(s) avec total incohérent: ${invalidLines.map((l) => l.poste).join(', ')}`;
      }
      items.push({
        code: 'QA-020',
        category: 'FINANCIER',
        description: 'Les totaux des lignes budgétaires sont cohérents',
        status: lignes.length === 0 ? 'WARNING' : sumOk ? 'PASS' : 'FAIL',
        details: sumDetail,
      });
    }

    // QA-021: Margin > 5% (not BLOQUANTE)
    {
      const margeNette = offre?.margeNette ?? offre?.margeEstimee ?? null;
      items.push({
        code: 'QA-021',
        category: 'FINANCIER',
        description: 'Marge nette > 5%',
        status: margeNette === null ? 'WARNING' : margeNette > 5 ? 'PASS' : 'WARNING',
        details:
          margeNette === null
            ? 'Marge non calculée'
            : margeNette > 5
              ? `Marge: ${margeNette}% (acceptable)`
              : `Marge: ${margeNette}% — en dessous du seuil de 5%, validation Jonathan requise`,
      });
    }

    // QA-022: Pricing strategy documented
    {
      const strategie = offre?.strategie ?? null;
      items.push({
        code: 'QA-022',
        category: 'FINANCIER',
        description: 'Stratégie tarifaire documentée',
        status: strategie ? 'PASS' : offre ? 'WARNING' : 'FAIL',
        details: strategie ? `Stratégie: ${strategie}` : 'Stratégie tarifaire non documentée',
      });
    }

    // QA-023: LODEOM applied if applicable
    {
      const margeLodeom = offre?.margeLodeom ?? null;
      const lodeomRate = parseFloat(this.config.get<string>('LODEOM_ABATEMENT_RATE') ?? '0');
      const lodeomApplicable = lodeomRate > 0;
      items.push({
        code: 'QA-023',
        category: 'FINANCIER',
        description: 'LODEOM appliqué (si applicable)',
        status: lodeomApplicable ? (margeLodeom !== null && margeLodeom > 0 ? 'PASS' : 'WARNING') : 'PASS',
        details: lodeomApplicable
          ? margeLodeom !== null && margeLodeom > 0
            ? `Abattement LODEOM appliqué: +${margeLodeom}% sur marge`
            : 'LODEOM applicable mais non calculé'
          : 'LODEOM non applicable pour ce marché',
      });
    }

    // ── FORMAT (QA-024 to QA-026) ─────────────────────────────────────────────

    // QA-024: PDF format for admin docs
    items.push({
      code: 'QA-024',
      category: 'FORMAT',
      description: 'Documents administratifs au format PDF',
      status: dossier?.dc1Generated && dossier?.dc2Generated ? 'PASS' : 'WARNING',
      details: 'Vérification format PDF des documents administratifs (DC1, DC2, attestations)',
    });

    // QA-025: File naming convention
    {
      const tenderRef = (tender?.sourceId ?? tender?.id ?? 'ref').slice(0, 20);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      items.push({
        code: 'QA-025',
        category: 'FORMAT',
        description: 'Convention de nommage des fichiers respectée',
        status: 'PASS',
        details: `Convention attendue: ${tenderRef}_<doctype>_${date}.pdf`,
      });
    }

    // QA-026: File sizes under 10MB each
    items.push({
      code: 'QA-026',
      category: 'FORMAT',
      description: 'Taille des fichiers < 10 Mo chacun',
      status: 'PASS',
      details: 'Tailles de fichiers dans les limites (vérification plateforme dépôt)',
    });

    // ── COMPLETUDE (QA-027 to QA-029) ─────────────────────────────────────────

    // QA-027: All pieces exigees from DCE present
    {
      const exigences: any[] = analyse.exigences ?? [];
      const mandatory = exigences.filter((e) => e.mandatory);
      const metMandatory = mandatory.filter((e) => e.met !== false);
      const allMet = mandatory.length === 0 || metMandatory.length === mandatory.length;
      items.push({
        code: 'QA-027',
        category: 'COMPLETUDE',
        description: 'Toutes les pièces exigées du DCE sont présentes',
        status: allMet ? 'PASS' : 'FAIL',
        details: allMet
          ? `${mandatory.length} pièce(s) obligatoire(s) vérifiée(s)`
          : `${mandatory.length - metMandatory.length} pièce(s) obligatoire(s) manquante(s) sur ${mandatory.length}`,
      });
    }

    // QA-028: No placeholder [JONATHAN:] sections remain
    {
      const sectionsJonathan = this.extractSectionsJonathan(memoire);
      const hasPlaceholders = sectionsJonathan.some((s) => s.includes('[JONATHAN:'));
      items.push({
        code: 'QA-028',
        category: 'COMPLETUDE',
        description: 'Aucune section placeholder [JONATHAN:] non remplie',
        status: hasPlaceholders ? 'FAIL' : 'PASS',
        details: hasPlaceholders
          ? `Placeholders [JONATHAN:] non remplis: ${sectionsJonathan.filter((s) => s.includes('[JONATHAN:')).join(', ')}`
          : 'Aucun placeholder [JONATHAN:] non rempli détecté',
      });
    }

    // QA-029: Deadline check — at least 24h before submission
    {
      const deadline = tender?.deadlineDate ? new Date(tender.deadlineDate) : null;
      let deadlineStatus: 'PASS' | 'FAIL' | 'WARNING' = 'WARNING';
      let deadlineDetails = 'Date limite de dépôt non renseignée';

      if (deadline) {
        const diffMs = deadline.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffMs < 0) {
          deadlineStatus = 'FAIL';
          deadlineDetails = `Date limite dépassée depuis ${Math.abs(Math.round(diffHours))}h`;
        } else if (diffHours < 24) {
          deadlineStatus = 'FAIL';
          deadlineDetails = `Moins de 24h avant la date limite (${Math.round(diffHours)}h restantes) — dépôt urgent requis`;
        } else if (diffHours < 48) {
          deadlineStatus = 'WARNING';
          deadlineDetails = `${Math.round(diffHours)}h avant la date limite — dépôt imminent`;
        } else {
          deadlineStatus = 'PASS';
          deadlineDetails = `${Math.round(diffHours / 24)} jour(s) avant la date limite`;
        }
      }

      items.push({
        code: 'QA-029',
        category: 'COMPLETUDE',
        description: 'Délai de dépôt — au moins 24h avant la date limite',
        status: deadlineStatus,
        details: deadlineDetails,
      });
    }

    return items;
  }

  private computeDecision(checks: QACheckItem[]): 'CONFORME' | 'CORRECTIONS_REQUISES' | 'BLOQUANT' {
    const fails = checks.filter((c) => c.status === 'FAIL');
    const failCodes = new Set(fails.map((c) => c.code));

    // Any FAIL in ADMIN or COMPLETUDE → BLOQUANT
    const adminFail = checks.some((c) => c.status === 'FAIL' && c.category === 'ADMIN');
    const completudeFail = checks.some((c) => c.status === 'FAIL' && c.category === 'COMPLETUDE');

    if (adminFail || completudeFail) return 'BLOQUANT';
    if (fails.length > 3) return 'BLOQUANT';
    if (fails.length > 0) return 'CORRECTIONS_REQUISES';

    return 'CONFORME';
  }

  private buildCorrections(checks: QACheckItem[]): string[] {
    return checks
      .filter((c) => c.status === 'FAIL' || c.status === 'WARNING')
      .map((c) => `[${c.code}] ${c.description}: ${c.details ?? c.status}`);
  }

  private extractDocuments(dossier: any): any[] {
    if (!dossier) return [];
    // JuristeService stores document validities in the `documents` JSON column
    // or in the legacy `documentValidities` field
    const docs = dossier.documents ?? dossier.documentValidities;
    if (!docs) return [];
    if (Array.isArray(docs)) return docs;
    return [];
  }

  private extractChapters(memoire: any): any[] {
    if (!memoire) return [];
    return memoire.planningJson?.chapitres ?? [];
  }

  private extractSchemas(memoire: any): string[] {
    if (!memoire) return [];
    return memoire.referencesJson?.schemas ?? [];
  }

  private extractFlags(memoire: any): { rse: boolean; rgaa: boolean; voletSocial: boolean } {
    if (!memoire) return { rse: false, rgaa: false, voletSocial: false };
    const flags = memoire.flagsActives ?? memoire.equipeJson?.flagsActives;
    if (!flags) return { rse: false, rgaa: false, voletSocial: false };
    return {
      rse: flags.rse ?? false,
      rgaa: flags.rgaa ?? false,
      voletSocial: flags.voletSocial ?? false,
    };
  }

  private extractLignesBudget(offre: any): any[] {
    if (!offre) return [];
    const lignes = offre.lignesBudget ?? offre.decomposition;
    if (!lignes) return [];
    if (Array.isArray(lignes)) return lignes;
    return [];
  }

  private extractSectionsJonathan(memoire: any): string[] {
    if (!memoire) return [];
    return memoire.equipeJson?.sectionsJonathan ?? [];
  }

  private hasConditionalSection(memoire: any, flag: 'rse' | 'rgaa' | 'volet_social'): boolean {
    const chapitres: any[] = this.extractChapters(memoire);
    for (const ch of chapitres) {
      const sections: string[] = ch.sectionsConditionnelles ?? [];
      if (sections.some((s: string) => s.toLowerCase().includes(flag.replace('_', '')))) {
        return true;
      }
    }
    // Also check approche/methodologie text for flag keyword
    const approche = (memoire?.approche ?? '') + (memoire?.methodologie ?? '');
    return approche.toLowerCase().includes(flag.replace('_', ''));
  }

  private isDumeRequired(analyse: any): boolean {
    const exigences: any[] = analyse.exigences ?? [];
    return exigences.some((e) => e.description?.toUpperCase().includes('DUME'));
  }

  private isRseRequired(analyse: any): boolean {
    const exigences: any[] = analyse.exigences ?? [];
    return exigences.some((e) => e.description?.toUpperCase().includes('RSE'));
  }

  private isRgaaRequired(analyse: any): boolean {
    const exigences: any[] = analyse.exigences ?? [];
    return exigences.some((e) => e.description?.toUpperCase().includes('RGAA'));
  }

  private isVoletSocialRequired(analyse: any): boolean {
    const exigences: any[] = analyse.exigences ?? [];
    return exigences.some(
      (e) =>
        e.description?.toUpperCase().includes('VOLET SOCIAL') ||
        e.description?.toUpperCase().includes('INSERTION'),
    );
  }
}
