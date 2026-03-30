import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)/gi,
  /system\s*:/gi,
  /\[INST\]/gi,
  /<\|im_start\|>/gi,
  /prompt\s+injection/gi,
  /instructions?\s*:/gi,
];

const MAX_CHARS = 50_000;
const CHUNK_MAX_CHARS = 20_000;
const METADATA_MAX_CHARS = 5000;

export function sanitizeForPrompt(text: string): string {
  if (!text) return '';

  let sanitized = text;

  // Strip prompt injection boundary characters
  sanitized = sanitized.replace(/```/g, '[FILTERED]');
  sanitized = sanitized.replace(/<\|.*?\|>/g, '[FILTERED]');
  sanitized = sanitized.replace(/\[INST\]/gi, '[FILTERED]');

  // Apply INJECTION_PATTERNS regex filtering
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }

  // Truncate to safe length for metadata
  return sanitized.slice(0, METADATA_MAX_CHARS);
}

export interface DceExigence {
  code: string;
  type: string;
  description: string;
  source: string;
  priorite: 'OBLIGATOIRE' | 'IMPORTANT' | 'SOUHAITABLE';
}

export interface DceAnalysisOutput {
  conditions_participation: string[];
  criteres_evaluation: Array<{ critere: string; ponderation: number }>;
  pieces_exigees: string[];
  exigences_individuelles: Array<{
    code: string;
    type: string;
    description: string;
    source: string;
    priorite: string;
  }>;
  flags_conditionnels: {
    rse: boolean;
    rgaa: boolean;
    volet_social: boolean;
  };
  mots_cles_miroir: string[];
  strategie_prix_recommandee: string;
  suspicion_flags: {
    criteres_sur_mesure: boolean;
    references_impossibles: boolean;
    budget_sous_evalue: boolean;
    delai_irrealiste: boolean;
  };
}

type SuspicionFlag = keyof DceAnalysisOutput['suspicion_flags'];
const SUSPICION_KEYS: SuspicionFlag[] = [
  'criteres_sur_mesure',
  'references_impossibles',
  'budget_sous_evalue',
  'delai_irrealiste',
];

@Injectable()
export class DceAnalyzerService {
  private readonly logger = new Logger(DceAnalyzerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly config: ConfigService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  async analyzeDce(tenderId: string): Promise<{ analyseId: string; decision: 'GO' | 'NO_GO'; analysis: DceAnalysisOutput }> {
    const startTime = Date.now();

    const prismaAny = this.prisma as any;
    const tender = await prismaAny.publicTender.findUnique({
      where: { id: tenderId },
      include: { aoAnalyse: true },
    });

    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    // Check deadline first — if passed, immediate NO_GO without Claude call
    if (tender.deadlineDate && tender.deadlineDate < new Date()) {
      this.logger.warn({ msg: 'Tender deadline passed, NO_GO without DCE analysis', tenderId });

      const analyse = await prismaAny.aoAnalyse.upsert({
        where: { tenderId },
        create: { tenderId, status: 'completed', decision: 'NO_GO', decisionReason: 'Délai de réponse dépassé' },
        update: { status: 'completed', decision: 'NO_GO', decisionReason: 'Délai de réponse dépassé' },
      });

      await this.agentEventLogger.log({
        agentName: 'agent-appels-offres:9a',
        eventType: 'dce_deadline_passed',
        payload: { tenderId },
        result: { decision: 'NO_GO', reason: 'deadline_passed' },
        durationMs: Date.now() - startTime,
      });

      return { analyseId: analyse.id, decision: 'NO_GO', analysis: this.emptyAnalysis() };
    }

    // Download DCE — placeholder for Docker sandbox extraction
    const rawText = await this.downloadAndExtractDce(tender.sourceUrl ?? '');
    const sanitized = this.sanitizeDceText(rawText);

    const pages = Math.ceil(sanitized.length / 3000);

    // Chunk if large
    const chunks = pages > 100 ? this.chunkText(sanitized) : [sanitized];

    // Analyze each chunk, merge results
    let mergedAnalysis: DceAnalysisOutput = this.emptyAnalysis();
    for (const chunk of chunks) {
      const chunkResult = await this.callClaudeForDce(
        sanitizeForPrompt(tender.title),
        sanitizeForPrompt(tender.buyerName ?? ''),
        chunk,
      );
      mergedAnalysis = this.mergeAnalyses(mergedAnalysis, chunkResult);
    }

    // Validate + clamp scores
    mergedAnalysis.criteres_evaluation = mergedAnalysis.criteres_evaluation.map((c) => ({
      ...c,
      ponderation: Math.min(100, Math.max(0, c.ponderation)),
    }));

    // Detect fausse chance
    const fausseChance = this.detectFausseChance(mergedAnalysis);
    const decision = fausseChance ? 'NO_GO' : 'GO';

    // Extract and persist exigences + questions
    const exigenceRecords = this.extractExigences(mergedAnalysis);

    // C30 — audit trail: snapshot existing record before upsert
    const existingAnalyse = await prismaAny.aoAnalyse.findUnique({ where: { tenderId } });
    if (existingAnalyse) {
      await prismaAny.aoAnalyseHistory.create({
        data: { analyseId: existingAnalyse.id, snapshotData: existingAnalyse, changeType: 'analysis' },
      });
    }

    const analyse = await prismaAny.aoAnalyse.upsert({
      where: { tenderId },
      create: {
        tenderId,
        status: 'completed',
        currentStep: null,
        decision,
        decisionReason: fausseChance ? 'Suspicion de fausse chance détectée (critères sur mesure)' : 'DCE analysé avec succès',
        dceRawText: sanitized.slice(0, 5000),
        dcePages: pages,
      },
      update: {
        status: 'completed',
        currentStep: null,
        decision,
        decisionReason: fausseChance ? 'Suspicion de fausse chance détectée (critères sur mesure)' : 'DCE analysé avec succès',
        dceRawText: sanitized.slice(0, 5000),
        dcePages: pages,
      },
    });

    // Persist exigences
    if (exigenceRecords.length > 0) {
      await prismaAny.aoExigence.createMany({
        data: exigenceRecords.map((e: DceExigence) => ({
          analyseId: analyse.id,
          type: e.type,
          description: e.description,
          mandatory: e.priorite === 'OBLIGATOIRE',
          comment: `${e.source} | ${e.code}`,
        })),
        skipDuplicates: true,
      });
    }

    // Persist questions from mots_cles_miroir as AoQuestion entries
    const questions = this.buildQuestionsFromAnalysis(mergedAnalysis);
    if (questions.length > 0) {
      await prismaAny.aoQuestion.createMany({
        data: questions.map((q: string, i: number) => ({
          analyseId: analyse.id,
          question: q,
          category: 'DCE',
          priority: i < 3 ? 9 : 5,
        })),
        skipDuplicates: true,
      });
    }

    // Persist analysis JSON into tender
    await prismaAny.publicTender.update({
      where: { id: tenderId },
      data: {
        dceAnalyzed: true,
        dceAnalysisResult: mergedAnalysis,
      },
    });

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9a',
      eventType: 'dce_analyzed',
      payload: { tenderId },
      result: { decision, fausseChance, exigencesCount: exigenceRecords.length, pagesEstimate: pages },
      durationMs: Date.now() - startTime,
    });

    this.logger.log({ msg: 'DCE analyzed', tenderId, decision, fausseChance, pages });

    return { analyseId: analyse.id, decision, analysis: mergedAnalysis };
  }

  sanitizeDceText(text: string): string {
    let sanitized = text;
    for (const pattern of INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized.slice(0, MAX_CHARS);
  }

  chunkText(text: string, maxChars = CHUNK_MAX_CHARS): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n{2,}/);
    let current = '';

    for (const para of paragraphs) {
      if (current.length + para.length + 2 > maxChars) {
        if (current.length > 0) {
          chunks.push(current.trim());
          current = '';
        }
        // If single paragraph exceeds max, hard-slice it
        if (para.length > maxChars) {
          for (let i = 0; i < para.length; i += maxChars) {
            chunks.push(para.slice(i, i + maxChars));
          }
          continue;
        }
      }
      current += (current.length > 0 ? '\n\n' : '') + para;
    }

    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }

    return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
  }

  detectFausseChance(analysis: DceAnalysisOutput): boolean {
    const flags = analysis.suspicion_flags;
    const trueCount = SUSPICION_KEYS.filter((k) => flags[k]).length;
    // COLLECTIVE_SUSPICION: 3 or more flags active
    return trueCount >= 3;
  }

  extractExigences(claudeOutput: DceAnalysisOutput): DceExigence[] {
    return (claudeOutput.exigences_individuelles ?? []).map((e) => ({
      code: e.code || 'EX-000',
      type: e.type ?? 'TECHNIQUE',
      description: e.description ?? '',
      source: e.source ?? 'DCE',
      priorite: this.normalizePriorite(e.priorite),
    }));
  }

  private normalizePriorite(raw: string): 'OBLIGATOIRE' | 'IMPORTANT' | 'SOUHAITABLE' {
    const upper = (raw ?? '').toUpperCase();
    if (upper === 'OBLIGATOIRE') return 'OBLIGATOIRE';
    if (upper === 'IMPORTANT') return 'IMPORTANT';
    return 'SOUHAITABLE';
  }

  private async downloadAndExtractDce(sourceUrl: string): Promise<string> {
    // Docker sandbox placeholder — in production, calls a sandboxed microservice
    // that downloads the DCE ZIP and extracts text from PDFs via PyMuPDF
    this.logger.debug({ msg: 'DCE download placeholder', sourceUrl });
    return `[DCE content placeholder for URL: ${sourceUrl}]`;
  }

  private async callClaudeForDce(title: string, buyerName: string, dceChunk: string): Promise<DceAnalysisOutput> {
    const systemPrompt = `Tu es un expert en marchés publics français travaillant pour Axiom Marketing (agence marketing digital, web, RGAA, e-commerce).
Analyse ce DCE (Dossier de Consultation des Entreprises) et extrais les informations structurées.

Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "conditions_participation": ["<condition>"],
  "criteres_evaluation": [{"critere": "<nom>", "ponderation": <0-100>}],
  "pieces_exigees": ["<pièce>"],
  "exigences_individuelles": [{"code": "EX-001", "type": "<TECHNIQUE|ADMINISTRATIVE|FINANCIERE|JURIDIQUE>", "description": "<desc>", "source": "<section DCE>", "priorite": "<OBLIGATOIRE|IMPORTANT|SOUHAITABLE>"}],
  "flags_conditionnels": {"rse": <bool>, "rgaa": <bool>, "volet_social": <bool>},
  "mots_cles_miroir": ["<mot-clé>"],
  "strategie_prix_recommandee": "<conseil>",
  "suspicion_flags": {
    "criteres_sur_mesure": <bool>,
    "references_impossibles": <bool>,
    "budget_sous_evalue": <bool>,
    "delai_irrealiste": <bool>
  }
}`;

    const userPrompt = `APPEL D'OFFRES: ${title}
ACHETEUR: ${buyerName}

DCE (extrait):
${dceChunk}`;

    const result = await this.llmService.call({
      task: LlmTask.ANALYZE_DCE,
      systemPrompt,
      userPrompt,
      maxTokens: 2000,
      temperature: 0.1,
    });

    try {
      // Strip markdown code fences if present
      const cleaned = result.content.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      return JSON.parse(cleaned) as DceAnalysisOutput;
    } catch {
      this.logger.warn({ msg: 'Failed to parse Claude DCE output, using empty analysis' });
      return this.emptyAnalysis();
    }
  }

  private mergeAnalyses(base: DceAnalysisOutput, incoming: DceAnalysisOutput): DceAnalysisOutput {
    return {
      conditions_participation: [...new Set([...base.conditions_participation, ...incoming.conditions_participation])],
      criteres_evaluation: incoming.criteres_evaluation.length > 0 ? incoming.criteres_evaluation : base.criteres_evaluation,
      pieces_exigees: [...new Set([...base.pieces_exigees, ...incoming.pieces_exigees])],
      exigences_individuelles: [...base.exigences_individuelles, ...incoming.exigences_individuelles],
      flags_conditionnels: {
        rse: base.flags_conditionnels.rse || incoming.flags_conditionnels.rse,
        rgaa: base.flags_conditionnels.rgaa || incoming.flags_conditionnels.rgaa,
        volet_social: base.flags_conditionnels.volet_social || incoming.flags_conditionnels.volet_social,
      },
      mots_cles_miroir: [...new Set([...base.mots_cles_miroir, ...incoming.mots_cles_miroir])],
      strategie_prix_recommandee: incoming.strategie_prix_recommandee || base.strategie_prix_recommandee,
      suspicion_flags: {
        criteres_sur_mesure: base.suspicion_flags.criteres_sur_mesure || incoming.suspicion_flags.criteres_sur_mesure,
        references_impossibles: base.suspicion_flags.references_impossibles || incoming.suspicion_flags.references_impossibles,
        budget_sous_evalue: base.suspicion_flags.budget_sous_evalue || incoming.suspicion_flags.budget_sous_evalue,
        delai_irrealiste: base.suspicion_flags.delai_irrealiste || incoming.suspicion_flags.delai_irrealiste,
      },
    };
  }

  private buildQuestionsFromAnalysis(analysis: DceAnalysisOutput): string[] {
    const questions: string[] = [];
    if (analysis.flags_conditionnels.rgaa) {
      questions.push('Quels sont les niveaux RGAA exigés (A, AA, AAA) et les référentiels de test acceptés ?');
    }
    if (analysis.flags_conditionnels.rse) {
      questions.push('Quelles preuves RSE sont requises (label, bilan carbone, politique achats responsables) ?');
    }
    if (analysis.flags_conditionnels.volet_social) {
      questions.push('Quel est le volume horaire minimal attendu pour le volet social (insertion, handicap) ?');
    }
    for (const motCle of analysis.mots_cles_miroir.slice(0, 5)) {
      questions.push(`Pouvez-vous préciser les attentes concernant "${motCle}" dans votre cahier des charges ?`);
    }
    return questions;
  }

  private emptyAnalysis(): DceAnalysisOutput {
    return {
      conditions_participation: [],
      criteres_evaluation: [],
      pieces_exigees: [],
      exigences_individuelles: [],
      flags_conditionnels: { rse: false, rgaa: false, volet_social: false },
      mots_cles_miroir: [],
      strategie_prix_recommandee: '',
      suspicion_flags: {
        criteres_sur_mesure: false,
        references_impossibles: false,
        budget_sous_evalue: false,
        delai_irrealiste: false,
      },
    };
  }
}
