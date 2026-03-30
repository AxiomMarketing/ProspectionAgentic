import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { DceAnalysisOutput, sanitizeForPrompt } from './dce-analyzer.service';

export type TenderDecision = 'GO' | 'POSSIBLE' | 'NO_GO';

export interface QualificationAxes {
  pertinence: number;
  competences: number;
  budget: number;
  concurrence: number;
  delai: number;
  references: number;
  capacite: number;
}

export interface QualificationResult {
  tenderId: string;
  analyseId: string;
  axes: QualificationAxes;
  totalScore: number;
  ev: number;
  decision: TenderDecision;
  decisionReason: string;
  cached: boolean;
}

const AXES_WEIGHTS: Record<keyof QualificationAxes, number> = {
  pertinence: 0.25,
  competences: 0.20,
  budget: 0.15,
  concurrence: 0.10,
  delai: 0.10,
  references: 0.10,
  capacite: 0.10,
};

const DEFAULT_TJM = 800;

@Injectable()
export class QualifierService {
  private readonly logger = new Logger(QualifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  async qualifyTender(
    tenderId: string,
    dceAnalysis: DceAnalysisOutput,
    forceReanalyze = false,
  ): Promise<QualificationResult> {
    const startTime = Date.now();

    const prismaAny = this.prisma as any;
    const tender = await prismaAny.publicTender.findUnique({
      where: { id: tenderId },
      include: { aoAnalyse: true },
    });

    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    const existingAnalyse = tender.aoAnalyse;

    // Idempotence: return cached result if already qualified
    if (!forceReanalyze && existingAnalyse?.decision && existingAnalyse.decision !== 'pending') {
      const cachedAxes: QualificationAxes = {
        pertinence: existingAnalyse.scorePertinence ?? 50,
        competences: existingAnalyse.scoreCompetence ?? 50,
        budget: existingAnalyse.scoreBudget ?? 50,
        concurrence: existingAnalyse.scoreConcurrence ?? 50,
        delai: 50,
        references: 50,
        capacite: 50,
      };
      const cachedScore = existingAnalyse.scoreTotal ?? this.calculateWeightedScore(cachedAxes);
      const cachedEv = existingAnalyse.evCalculated ?? 0;

      this.logger.debug({ msg: 'Returning cached qualification', tenderId });

      return {
        tenderId,
        analyseId: existingAnalyse.id,
        axes: cachedAxes,
        totalScore: cachedScore,
        ev: cachedEv,
        decision: existingAnalyse.decision as TenderDecision,
        decisionReason: existingAnalyse.decisionReason ?? 'Résultat en cache',
        cached: true,
      };
    }

    // Missing delai, references, capacite from cache — use actual scoring for fresh results

    // Score 7 axes based on DCE analysis
    const axes = this.scoreAxes(tender, dceAnalysis);
    const totalScore = this.calculateWeightedScore(axes);

    const montant = tender.estimatedAmount ?? tender.estimatedBudget ?? 0;
    const margePercent = this.estimateMargePercent(montant);
    const probaGain = this.getSuccessRate(tender.source);
    const effortHours = this.estimateEffortHours(montant, tender.source);

    const ev = this.calculateExpectedValue(montant, margePercent, probaGain, effortHours);

    const { decision, reason } = this.determineDecision(totalScore, ev, tender.source);

    // C30 — audit trail: snapshot existing record before update
    if (existingAnalyse) {
      await prismaAny.aoAnalyseHistory.create({
        data: { analyseId: existingAnalyse.id, snapshotData: existingAnalyse, changeType: 'qualification' },
      });
    }

    // Persist qualification results
    const analyseId = existingAnalyse?.id;
    const updatedAnalyse = analyseId
      ? await prismaAny.aoAnalyse.update({
          where: { id: analyseId },
          data: {
            scoreTotal: totalScore,
            scorePertinence: axes.pertinence,
            scoreCompetence: axes.competences,
            scoreBudget: axes.budget,
            scoreConcurrence: axes.concurrence,
            scoreDelai: axes.delai,
            scoreReferences: axes.references,
            scoreCapacite: axes.capacite,
            evCalculated: ev,
            decision,
            decisionReason: reason,
            status: 'qualifying',
            currentStep: 'ao:qualify',
          },
        })
      : await prismaAny.aoAnalyse.create({
          data: {
            tenderId,
            scoreTotal: totalScore,
            scorePertinence: axes.pertinence,
            scoreCompetence: axes.competences,
            scoreBudget: axes.budget,
            scoreConcurrence: axes.concurrence,
            scoreDelai: axes.delai,
            scoreReferences: axes.references,
            scoreCapacite: axes.capacite,
            evCalculated: ev,
            decision,
            decisionReason: reason,
            status: 'qualifying',
            currentStep: 'ao:qualify',
          },
        });

    // Update tender dceFitScore
    await prismaAny.publicTender.update({
      where: { id: tenderId },
      data: { dceFitScore: totalScore },
    });

    // Notify Jonathan for POSSIBLE decisions
    if (decision === 'POSSIBLE') {
      await this.notifyJonathan(tenderId, totalScore, decision);
    }

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9b',
      eventType: 'tender_qualified',
      payload: { tenderId },
      result: { decision, totalScore, ev, axes: axes as unknown as Record<string, unknown> },
      durationMs: Date.now() - startTime,
    });

    this.logger.log({ msg: 'Tender qualified', tenderId, totalScore, ev, decision });

    return {
      tenderId,
      analyseId: updatedAnalyse.id,
      axes,
      totalScore,
      ev,
      decision,
      decisionReason: reason,
      cached: false,
    };
  }

  calculateWeightedScore(axes: QualificationAxes): number {
    const total = Object.entries(AXES_WEIGHTS).reduce((sum, [key, weight]) => {
      return sum + (axes[key as keyof QualificationAxes] ?? 50) * weight;
    }, 0);
    return Math.round(Math.min(100, Math.max(0, total)));
  }

  calculateExpectedValue(
    montant: number,
    margePercent: number,
    probaGain: number,
    effortHours: number,
    tjm = DEFAULT_TJM,
  ): number {
    const tjmPerHour = tjm / 8;
    const grossValue = montant * (margePercent / 100) * probaGain;
    const costOfEffort = effortHours * tjmPerHour;
    return Math.round(grossValue - costOfEffort);
  }

  determineDecision(
    totalScore: number,
    ev: number,
    typeProcedure: string,
  ): { decision: TenderDecision; reason: string } {
    const evThreshold = typeProcedure.toUpperCase().includes('MAPA') ? 500 : 1000;

    if (totalScore < 50 || ev <= 0) {
      return {
        decision: 'NO_GO',
        reason: totalScore < 50
          ? `Score insuffisant (${totalScore}/100, seuil: 50)`
          : `Valeur espérée négative ou nulle (${ev} EUR)`,
      };
    }

    if (totalScore >= 70 && ev > evThreshold) {
      return {
        decision: 'GO',
        reason: `Score élevé (${totalScore}/100) et VE positive (${ev} EUR > seuil ${evThreshold} EUR)`,
      };
    }

    return {
      decision: 'POSSIBLE',
      reason: `Score moyen (${totalScore}/100) — décision humaine requise. VE: ${ev} EUR`,
    };
  }

  async notifyJonathan(tenderId: string, score: number, decision: TenderDecision): Promise<void> {
    const slackWebhookUrl = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) {
      this.logger.warn({ msg: 'SLACK_WEBHOOK_URL not configured, skipping notification', tenderId });
      return;
    }

    try {
      const tender = await (this.prisma as any).publicTender.findUnique({ where: { id: tenderId } });
      const appUrl = this.config.get<string>('APP_URL') ?? 'https://app.axiom-marketing.fr';

      const payload = {
        text: `Appel d'offres en attente de décision — score: ${score}/100`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Appel d'offres :* ${sanitizeForPrompt(tender?.title ?? tenderId)}\n*Acheteur :* ${sanitizeForPrompt(tender?.buyerName ?? 'Inconnu')}\n*Score :* ${score}/100\n*Décision suggérée :* ${decision}`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'GO - On répond' },
                style: 'primary',
                action_id: 'ao_decision_go',
                value: JSON.stringify({ tenderId, decision: 'GO' }),
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'NO-GO - On passe' },
                style: 'danger',
                action_id: 'ao_decision_no_go',
                value: JSON.stringify({ tenderId, decision: 'NO_GO' }),
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Voir le détail' },
                url: `${appUrl}/ao/${tenderId}`,
                action_id: 'ao_view_detail',
              },
            ],
          },
        ],
      };

      await firstValueFrom(
        this.httpService.post(slackWebhookUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        }),
      );

      this.logger.log({ msg: 'Slack notification sent', tenderId, decision });
    } catch (error) {
      this.logger.warn({ msg: 'Slack notification failed', tenderId, error: (error as Error).message });
    }
  }

  getSuccessRate(typeProcedure: string): number {
    const upper = (typeProcedure ?? '').toUpperCase();
    if (upper.includes('MAPA')) return 0.425; // 35-50% midpoint
    if (upper.includes('RESTREINT')) return 0.50; // 40-60% midpoint
    if (upper.includes('RECONDUCTION')) return 0.70; // 60-80% midpoint
    return 0.20; // AO Ouvert default 15-25% midpoint
  }

  private scoreAxes(tender: any, dceAnalysis: DceAnalysisOutput): QualificationAxes {
    const flags = dceAnalysis.flags_conditionnels;

    // Pertinence: based on dce keywords + RSE/RGAA fit
    let pertinence = 60;
    if (flags.rgaa) pertinence += 15; // RGAA is Axiom strength
    if (flags.rse) pertinence += 5;
    const digitalKeywords = ['web', 'digital', 'marketing', 'communication', 'e-commerce', 'site', 'application'];
    const hasDigital = digitalKeywords.some((k) =>
      (tender.title ?? '').toLowerCase().includes(k) ||
      (tender.description ?? '').toLowerCase().includes(k),
    );
    if (hasDigital) pertinence += 15;

    // Competences
    let competences = 55;
    if (flags.rgaa) competences += 20;
    const exigencesCount = dceAnalysis.exigences_individuelles.length;
    if (exigencesCount > 10) competences -= 10; // high complexity penalty
    if (exigencesCount === 0) competences += 10; // simple tender bonus

    // Budget
    const montant = tender.estimatedAmount ?? tender.estimatedBudget ?? 0;
    let budget = 50;
    if (montant === 0) budget = 50; // unknown budget, neutral
    else if (montant >= 20000 && montant <= 500000) budget = 80;
    else if (montant > 500000) budget = 65;
    else if (montant >= 10000 && montant < 20000) budget = 65;
    else if (montant < 10000) budget = 20; // too small to be profitable

    // Concurrence: suspicion flags reduce concurrence score
    let concurrence = 70;
    if (dceAnalysis.suspicion_flags.criteres_sur_mesure) concurrence = 20;
    else if (dceAnalysis.suspicion_flags.references_impossibles) concurrence = 30;

    // Delai: check if there's enough time (at least 10 days)
    let delai = 70;
    if (tender.deadlineDate) {
      const daysLeft = Math.floor((tender.deadlineDate.getTime() - Date.now()) / 86_400_000);
      if (daysLeft < 5) delai = 10;
      else if (daysLeft < 10) delai = 40;
      else if (daysLeft < 20) delai = 65;
      else delai = 85;
    }

    // References
    let references = 50;
    if (flags.rgaa) references = 75;
    if (hasDigital) references += 10;

    // Capacite: flat default, could be enriched with team calendar integration
    const capacite = 65;

    return {
      pertinence: Math.min(100, Math.max(0, pertinence)),
      competences: Math.min(100, Math.max(0, competences)),
      budget: Math.min(100, Math.max(0, budget)),
      concurrence: Math.min(100, Math.max(0, concurrence)),
      delai: Math.min(100, Math.max(0, delai)),
      references: Math.min(100, Math.max(0, references)),
      capacite: Math.min(100, Math.max(0, capacite)),
    };
  }

  private estimateMargePercent(montant: number): number {
    if (montant <= 0) return 15;
    if (montant < 50000) return 25;
    if (montant < 200000) return 20;
    return 15;
  }

  private estimateEffortHours(montant: number, source: string): number {
    const upper = (source ?? '').toUpperCase();
    if (upper.includes('MAPA')) return 16; // lighter effort for MAPA
    if (montant > 200000) return 40;
    if (montant > 50000) return 24;
    return 16;
  }
}
