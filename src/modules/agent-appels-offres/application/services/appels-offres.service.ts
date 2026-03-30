import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { DceAnalyzerService, DceAnalysisOutput } from './dce-analyzer.service';
import { QualifierService, QualificationResult } from './qualifier.service';
import { JuristeService, DossierAdminResult } from './juriste.service';
import { ChiffreurService, OffreFinanciereResult } from './chiffreur.service';
import { MemoireRedacteurService, MemoireTechniqueResult } from './memoire-redacteur.service';
import { ControleurQaService, QAReport } from './controleur-qa.service';
import { MoniteurService, MonitorStatus, RetexReport } from './moniteur.service';
import { PipelineOrchestratorService } from './pipeline-orchestrator.service';

export interface PipelineProgress {
  tenderId: string;
  analyseId: string;
  status: string;
  currentStep: string | null;
  steps: Array<{
    code: string;
    name: string;
    status: 'pending' | 'in_progress' | 'done' | 'failed';
  }>;
}

export interface TenderSummary {
  id: string;
  title: string;
  buyerName: string | null;
  status: string;
  dceFitScore: number | null;
  deadlineDate: Date | null;
  createdAt: Date;
}

@Injectable()
export class AppelsOffresService {
  private readonly logger = new Logger(AppelsOffresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly dceAnalyzer: DceAnalyzerService,
    private readonly qualifier: QualifierService,
    private readonly juriste: JuristeService,
    private readonly chiffreur: ChiffreurService,
    private readonly memoireRedacteur: MemoireRedacteurService,
    private readonly controleurQa: ControleurQaService,
    private readonly moniteur: MoniteurService,
    private readonly pipelineOrchestrator: PipelineOrchestratorService,
  ) {}

  // ─── PIPELINE ORCHESTRATION ──────────────────────────────────

  async launchPipeline(tenderId: string): Promise<{ analyseId: string }> {
    const tender = await this.prisma.publicTender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    await this.pipelineOrchestrator.orchestratePipeline(tenderId);

    const analyse = await (this.prisma as any).aoAnalyse.findUnique({ where: { tenderId } });

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres',
      eventType: 'pipeline_launched',
      payload: { tenderId, title: tender.title },
      result: { analyseId: analyse?.id },
      durationMs: 0,
    });

    return { analyseId: analyse?.id };
  }

  async getPipelineProgress(tenderId: string): Promise<PipelineProgress> {
    const analyse = await (this.prisma as any).aoAnalyse.findUnique({ where: { tenderId } });
    if (!analyse) throw new NotFoundException(`No analysis found for tender ${tenderId}`);

    const steps = this.buildProgressSteps(analyse);

    return {
      tenderId,
      analyseId: analyse.id,
      status: analyse.status,
      currentStep: analyse.currentStep ?? null,
      steps,
    };
  }

  // ─── SUB-AGENT DIRECT CALLS (for manual/step-by-step execution) ──

  async analyzeDce(tenderId: string): Promise<{ analyseId: string; decision: string; analysis: DceAnalysisOutput }> {
    return this.dceAnalyzer.analyzeDce(tenderId);
  }

  async qualifyTender(tenderId: string, forceReanalyze = false): Promise<QualificationResult> {
    const analyse = await (this.prisma as any).aoAnalyse.findUnique({ where: { tenderId } });
    if (!analyse) throw new NotFoundException(`No DCE analysis found. Run analyzeDce first.`);

    const dceAnalysis = this.extractDceAnalysis(analyse);

    return this.qualifier.qualifyTender(tenderId, dceAnalysis, forceReanalyze);
  }

  async prepareDossierAdmin(tenderId: string): Promise<DossierAdminResult> {
    const analyse = await this.getAnalyseOrThrow(tenderId);
    const dceAnalysis = this.extractDceAnalysis(analyse);
    return this.juriste.prepareDossierAdmin(tenderId, analyse.id, dceAnalysis);
  }

  async generateOffreFinanciere(tenderId: string): Promise<OffreFinanciereResult> {
    const analyse = await this.getAnalyseOrThrow(tenderId);
    const dceAnalysis = this.extractDceAnalysis(analyse);
    const qualAxes = {
      axes: {
        pertinence: analyse.scorePertinence ?? 50,
        competences: analyse.scoreCompetence ?? 50,
        budget: analyse.scoreBudget ?? 50,
        concurrence: analyse.scoreConcurrence ?? 50,
        delai: analyse.scoreDelai ?? 50,
        references: analyse.scoreReferences ?? 50,
        capacite: analyse.scoreCapacite ?? 50,
      },
    };
    return this.chiffreur.generateOffreFinanciere(tenderId, analyse.id, dceAnalysis, qualAxes);
  }

  async generateMemoireTechnique(tenderId: string): Promise<MemoireTechniqueResult> {
    const analyse = await this.getAnalyseOrThrow(tenderId);
    const dceAnalysis = this.extractDceAnalysis(analyse);
    return this.memoireRedacteur.generateMemoireTechnique(tenderId, analyse.id, dceAnalysis);
  }

  async runQualityControl(tenderId: string): Promise<QAReport> {
    const analyse = await this.getAnalyseOrThrow(tenderId);
    return this.controleurQa.runQualityControl(tenderId, analyse.id);
  }

  async getMonitorStatus(tenderId: string): Promise<MonitorStatus> {
    return this.moniteur.checkTenderStatus(tenderId);
  }

  async processResult(tenderId: string, result: 'GAGNE' | 'PERDU' | 'SANS_SUITE', details?: Record<string, any>): Promise<RetexReport | void> {
    return this.moniteur.processResult(tenderId, result, details);
  }

  // ─── JONATHAN DECISION ENDPOINTS ──────────────────────────────

  async jonathanDecision(tenderId: string, decision: 'CONFIRME_GO' | 'FORCE_GO' | 'NO_GO', reason?: string): Promise<void> {
    const analyse = await this.getAnalyseOrThrow(tenderId);

    await (this.prisma as any).aoAnalyse.update({
      where: { id: analyse.id },
      data: {
        jonathanDecision: decision,
        jonathanReviewAt: new Date(),
        decisionReason: reason ?? analyse.decisionReason,
        decision: decision === 'NO_GO' ? 'NO_GO' : 'GO',
      },
    });

    if (decision === 'CONFIRME_GO' || decision === 'FORCE_GO') {
      await this.pipelineOrchestrator.updateStepStatus(analyse.id, 'parallel_analysis', 'parallel_analysis');
      this.logger.log({ msg: 'Jonathan confirmed GO', tenderId, decision });
    } else {
      await this.pipelineOrchestrator.updateStepStatus(analyse.id, 'ignored', 'ignored');
      this.logger.log({ msg: 'Jonathan decided NO_GO', tenderId, reason });
    }

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres',
      eventType: 'jonathan_decision',
      payload: { tenderId, decision, reason },
      result: { decision },
      durationMs: 0,
    });
  }

  // ─── CRUD ──────────────────────────────────────────────────────

  async listTenders(page = 1, limit = 20): Promise<{ data: TenderSummary[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.publicTender.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          buyerName: true,
          status: true,
          dceFitScore: true,
          deadlineDate: true,
          createdAt: true,
        },
      }),
      this.prisma.publicTender.count(),
    ]);
    return { data: data as unknown as TenderSummary[], total };
  }

  async getTender(tenderId: string): Promise<any> {
    const tender = await this.prisma.publicTender.findUnique({
      where: { id: tenderId },
    });
    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);
    return tender;
  }

  async getAnalysis(tenderId: string): Promise<any> {
    const analyse = await (this.prisma as any).aoAnalyse.findUnique({
      where: { tenderId },
      include: {
        exigences: true,
        questions: true,
      },
    });
    if (!analyse) throw new NotFoundException(`No analysis for tender ${tenderId}`);
    return analyse;
  }

  // ─── HEALTH CHECK ──────────────────────────────────────────────

  async healthCheck(): Promise<{
    status: string;
    activePipelines: number;
    pendingTenders: number;
    expiredDocuments: number;
  }> {
    const prismaAny = this.prisma as any;
    const [activePipelines, pendingTenders] = await Promise.all([
      prismaAny.aoAnalyse.count({ where: { status: { notIn: ['completed', 'failed', 'ignored'] } } }),
      this.prisma.publicTender.count({ where: { dceAnalyzed: false } }),
    ]);

    let expiredDocuments = 0;
    try {
      const validities = await this.juriste.checkDocumentValidity();
      expiredDocuments = validities.filter((d) => !d.valid).length;
    } catch {
      // Document check is non-critical
    }

    return { status: 'ok', activePipelines, pendingTenders, expiredDocuments };
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────────

  private async getAnalyseOrThrow(tenderId: string): Promise<any> {
    const analyse = await (this.prisma as any).aoAnalyse.findUnique({ where: { tenderId } });
    if (!analyse) throw new NotFoundException(`No analysis found for tender ${tenderId}. Run the pipeline first.`);
    return analyse;
  }

  private extractDceAnalysis(analyse: any): DceAnalysisOutput {
    return {
      conditions_participation: analyse.conditionsPartic ?? [],
      criteres_evaluation: analyse.criteresEval ?? [],
      pieces_exigees: analyse.piecesExigees ?? [],
      exigences_individuelles: analyse.exigencesTech ?? [],
      flags_conditionnels: analyse.flagsConditionnels ?? { rse: false, rgaa: false, volet_social: false },
      mots_cles_miroir: analyse.motsClesMiroir ?? [],
      strategie_prix_recommandee: analyse.strategiePrix ?? '',
      suspicion_flags: analyse.suspicionFlags ?? { criteres_sur_mesure: false, references_impossibles: false, budget_sous_evalue: false, delai_irrealiste: false },
    };
  }

  private buildProgressSteps(analyse: any): PipelineProgress['steps'] {
    const statusMap: Record<string, string> = {
      pending: 'pending',
      analyzing_dce: 'in_progress',
      qualifying: 'in_progress',
      parallel_analysis: 'in_progress',
      redacting: 'in_progress',
      qa_control: 'in_progress',
      completed: 'done',
      failed: 'failed',
      ignored: 'done',
    };

    const stepDefs = [
      { code: '9a', name: 'Analyse DCE', trigger: 'analyzing_dce' },
      { code: '9b', name: 'Qualification GO/NO-GO', trigger: 'qualifying' },
      { code: '9c', name: 'Dossier administratif', trigger: 'parallel_analysis' },
      { code: '9d', name: 'Offre financière', trigger: 'parallel_analysis' },
      { code: '9e', name: 'Mémoire technique', trigger: 'redacting' },
      { code: '9f', name: 'Contrôle qualité', trigger: 'qa_control' },
      { code: '9g', name: 'Monitoring post-dépôt', trigger: 'completed' },
    ];

    const currentIdx = stepDefs.findIndex((s) => s.trigger === analyse.status);

    return stepDefs.map((step, idx) => {
      let status: 'pending' | 'in_progress' | 'done' | 'failed' = 'pending';
      if (analyse.status === 'failed') {
        status = idx <= currentIdx ? 'failed' : 'pending';
      } else if (idx < currentIdx) {
        status = 'done';
      } else if (idx === currentIdx) {
        status = 'in_progress';
      }
      return { code: step.code, name: step.name, status };
    });
  }
}
