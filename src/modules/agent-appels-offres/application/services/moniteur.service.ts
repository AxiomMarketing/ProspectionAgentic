import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { sanitizeForPrompt } from './dce-analyzer.service';

export type AlertType =
  | 'qr_published'
  | 'dce_modified'
  | 'deadline_extended'
  | 'result_won'
  | 'result_lost'
  | 'debrief_received'
  | 'no_news_30d'
  | 'procedure_collective'
  | 'regulatory_change';

export type EscalationLevel = 1 | 2 | 3;

export interface MonitorAlert {
  type: AlertType;
  tenderId: string;
  level: EscalationLevel;
  message: string;
  actionRequired: string;
  createdAt: Date;
}

export interface RetexReport {
  tenderId: string;
  title: string;
  acheteur: string;
  montant: number;
  resultat: 'GAGNE' | 'PERDU' | 'SANS_SUITE';
  rankObtenu?: number;
  scoreObtenu?: number;
  prixLaureat?: number;
  nbCandidats?: number;
  pointsForts: string[];
  pointsFaibles: string[];
  lecons: string[];
  actionsAmelioration: string[];
  ecartPrix?: number;
  ajustementScoring?: string;
}

export interface MonitorStatus {
  tenderId: string;
  phase: 'ACTIVE' | 'ATTENTE' | 'RESULTAT';
  daysSinceSubmission: number;
  lastCheckAt: Date;
  alerts: MonitorAlert[];
}

const PHASE_THRESHOLDS = {
  ACTIVE: 15,
  ATTENTE: 60,
} as const;

@Injectable()
export class MoniteurService {
  private readonly logger = new Logger(MoniteurService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly agentEventLogger: AgentEventLoggerService,
    @InjectQueue(QUEUE_NAMES.DEALMAKER_PIPELINE) private readonly dealmakerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CSM_ONBOARDING) private readonly csmQueue: Queue,
  ) {}

  async checkTenderStatus(tenderId: string): Promise<MonitorStatus> {
    const startTime = Date.now();
    const prismaAny = this.prisma as any;

    const tender = await prismaAny.publicTender.findUnique({
      where: { id: tenderId },
      include: { aoAnalyse: true },
    });
    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    const submissionDate = this.resolveSubmissionDate(tender);
    const now = new Date();
    const daysSinceSubmission = submissionDate
      ? Math.floor((now.getTime() - submissionDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const phase = this.determinePhase(daysSinceSubmission);
    const alerts: MonitorAlert[] = [];

    // Check for new Q&R published
    const hasNewQr = await this.checkForNewQuestionsReplies(tender);
    if (hasNewQr) {
      alerts.push({
        type: 'qr_published',
        tenderId,
        level: this.determineEscalationLevel('qr_published'),
        message: `Nouvelles questions/réponses publiées pour "${tender.title}"`,
        actionRequired: 'Re-analyser le DCE et mettre à jour le mémoire technique si nécessaire',
        createdAt: now,
      });
    }

    // Check for DCE modifications
    const hasDceModification = await this.checkForDceModification(tender);
    if (hasDceModification) {
      alerts.push({
        type: 'dce_modified',
        tenderId,
        level: this.determineEscalationLevel('dce_modified'),
        message: `DCE modifié pour "${tender.title}"`,
        actionRequired: 'Relancer l\'analyse 9a et alerter Jonathan pour validation',
        createdAt: now,
      });
    }

    // No news after 30 days in ATTENTE phase
    if (phase === 'ATTENTE' && daysSinceSubmission >= 30) {
      const existingAlert = await this.hasExistingAlert(tenderId, 'no_news_30d');
      if (!existingAlert) {
        alerts.push({
          type: 'no_news_30d',
          tenderId,
          level: this.determineEscalationLevel('no_news_30d'),
          message: `Aucune nouvelle depuis ${daysSinceSubmission} jours pour "${tender.title}"`,
          actionRequired: 'Relancer l\'acheteur pour obtenir des nouvelles sur le résultat',
          createdAt: now,
        });
      }
    }

    // Log all new alerts
    for (const alert of alerts) {
      await this.agentEventLogger.log({
        agentName: 'agent-appels-offres:9g',
        eventType: `alert_${alert.type}`,
        payload: { tenderId, alertType: alert.type, level: alert.level },
        result: { message: alert.message },
        durationMs: Date.now() - startTime,
      });
    }

    this.logger.log({ msg: 'Tender status checked', tenderId, phase, daysSinceSubmission, alertsCount: alerts.length });

    return {
      tenderId,
      phase,
      daysSinceSubmission,
      lastCheckAt: now,
      alerts,
    };
  }

  async processResult(
    tenderId: string,
    result: 'GAGNE' | 'PERDU' | 'SANS_SUITE',
    details?: Record<string, any>,
  ): Promise<RetexReport | void> {
    const startTime = Date.now();
    const prismaAny = this.prisma as any;

    const tender = await prismaAny.publicTender.findUnique({
      where: { id: tenderId },
      include: { aoAnalyse: true },
    });
    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    // Update tender status
    const newStatus = result === 'GAGNE' ? 'WON' : result === 'PERDU' ? 'LOST' : 'LOST';
    await prismaAny.publicTender.update({
      where: { id: tenderId },
      data: { status: newStatus },
    });

    if (result === 'GAGNE') {
      this.logger.log({ msg: 'Tender WON — preparing signature documents', tenderId });

      // Alert for signature + transfer to Agent 8/10
      const alert: MonitorAlert = {
        type: 'result_won',
        tenderId,
        level: this.determineEscalationLevel('result_won'),
        message: `Appel d'offres GAGNÉ: "${tender.title}"`,
        actionRequired: 'Préparer les documents de signature AE et transférer vers Agent 8 (onboarding) et Agent 10 (contrat)',
        createdAt: new Date(),
      };
      await this.processAlert(alert);

      // C28 — dispatch to Agent 8 (Dealmaker) and Agent 10 (CSM) via BullMQ
      await this.dealmakerQueue.add('create-deal', {
        tenderId,
        source: 'appels-offres',
        title: tender.title,
        amount: tender.estimatedAmount,
      });
      await this.csmQueue.add('onboard-customer', {
        companyName: tender.buyerName,
        source: 'appels-offres',
        tenderId,
      });

      await this.agentEventLogger.log({
        agentName: 'agent-appels-offres:9g',
        eventType: 'tender_won',
        payload: { tenderId, details },
        result: { action: 'prepare_signature_transfer_agents_8_10' },
        durationMs: Date.now() - startTime,
      });

      return;
    }

    if (result === 'SANS_SUITE') {
      this.logger.log({ msg: 'Tender SANS_SUITE — archiving', tenderId });

      await this.agentEventLogger.log({
        agentName: 'agent-appels-offres:9g',
        eventType: 'tender_sans_suite',
        payload: { tenderId, details },
        result: { action: 'archived' },
        durationMs: Date.now() - startTime,
      });

      // Update analyse status
      if (tender.aoAnalyse) {
        await prismaAny.aoAnalyse.update({
          where: { id: tender.aoAnalyse.id },
          data: { status: 'completed', currentStep: null, decision: 'SANS_SUITE', decisionReason: 'Procédure abandonnée ou sans suite par l\'acheteur' },
        });
      }

      return;
    }

    // PERDU: generate R2181-3 letter + RETEX
    this.logger.log({ msg: 'Tender LOST — generating RETEX and R2181-3 letter', tenderId });

    const r2181Letter = await this.generateR2181Letter(tender);

    const alert: MonitorAlert = {
      type: 'result_lost',
      tenderId,
      level: this.determineEscalationLevel('result_lost'),
      message: `Appel d'offres PERDU: "${tender.title}"`,
      actionRequired: 'Générer le RETEX, envoyer la lettre R2181-3 pour demande d\'information',
      createdAt: new Date(),
    };
    await this.processAlert(alert);

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9g',
      eventType: 'tender_lost',
      payload: { tenderId, details, r2181LetterGenerated: true },
      result: { action: 'retex_initiated' },
      durationMs: Date.now() - startTime,
    });

    return this.generateRetex(tenderId, { ...details, resultat: 'PERDU', r2181Letter });
  }

  async generateRetex(tenderId: string, details: Record<string, any>): Promise<RetexReport> {
    const startTime = Date.now();
    const prismaAny = this.prisma as any;

    const tender = await prismaAny.publicTender.findUnique({
      where: { id: tenderId },
      include: { aoAnalyse: { include: { offreFinanciere: true } } },
    });
    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    const offre = tender.aoAnalyse?.offreFinanciere;
    const montant = offre?.montantTotal ?? offre?.montantHtEur ?? tender.estimatedAmount ?? 0;
    const resultat: RetexReport['resultat'] = details.resultat ?? 'PERDU';

    const systemPrompt = `Tu es un expert en marchés publics pour Axiom Marketing.
Génère un rapport RETEX (Retour d'Expérience) structuré et actionnable suite à un appel d'offres.

Réponds UNIQUEMENT en JSON valide avec cette structure:
{
  "pointsForts": ["<point fort>"],
  "pointsFaibles": ["<point faible>"],
  "lecons": ["<leçon apprise>"],
  "actionsAmelioration": ["<action concrète>"],
  "ajustementScoring": "<suggestion d'ajustement du scoring pour les prochains AO similaires>"
}

Sois concret, actionnable, et basé sur les données fournies.
Les actions d'amélioration doivent être spécifiques et mesurables.`;

    const userPrompt = `APPEL D'OFFRES: ${sanitizeForPrompt(tender.title)}
ACHETEUR: ${sanitizeForPrompt(tender.buyerName ?? 'Non renseigné')}
MONTANT PROPOSÉ: ${montant}€
RÉSULTAT: ${resultat}
${details.rankObtenu ? `RANG OBTENU: ${details.rankObtenu}` : ''}
${details.scoreObtenu ? `SCORE OBTENU: ${details.scoreObtenu}` : ''}
${details.prixLaureat ? `PRIX DU LAURÉAT: ${details.prixLaureat}€` : ''}
${details.nbCandidats ? `NOMBRE DE CANDIDATS: ${details.nbCandidats}` : ''}
${details.ecartPrix ? `ÉCART DE PRIX: ${details.ecartPrix}€` : ''}
${details.debriefContent ? `CONTENU DU DÉBRIEF: ${sanitizeForPrompt(details.debriefContent)}` : ''}

Stratégie tarifaire utilisée: ${offre?.strategie ?? 'EQUILIBREE'}
Marge proposée: ${offre?.margeNette ?? 'N/A'}%

Génère le RETEX complet avec recommandations pour améliorer nos futures candidatures.`;

    let retexData = {
      pointsForts: ['Dossier complet déposé dans les délais'],
      pointsFaibles: ['Analyse post-marché à approfondir'],
      lecons: ['Capitaliser sur cette expérience pour les prochains AO'],
      actionsAmelioration: ['Demander un débrief détaillé à l\'acheteur via R2181-3'],
      ajustementScoring: 'Réviser les critères de qualification pour ce type de marché',
    };

    try {
      const llmResult = await this.llmService.call({
        task: LlmTask.ANALYZE_COMPANY_STRATEGY,
        systemPrompt,
        userPrompt,
        maxTokens: 1500,
        temperature: 0.3,
      });
      const cleaned = llmResult.content.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      retexData = { ...retexData, ...parsed };
    } catch (error) {
      this.logger.warn({ msg: 'Failed to generate RETEX via Claude, using defaults', error: (error as Error).message });
    }

    const ecartPrix =
      details.prixLaureat && montant
        ? Math.round(((montant - details.prixLaureat) / details.prixLaureat) * 100)
        : undefined;

    const retex: RetexReport = {
      tenderId,
      title: tender.title,
      acheteur: tender.buyerName ?? 'Non renseigné',
      montant,
      resultat,
      rankObtenu: details.rankObtenu,
      scoreObtenu: details.scoreObtenu,
      prixLaureat: details.prixLaureat,
      nbCandidats: details.nbCandidats,
      pointsForts: retexData.pointsForts,
      pointsFaibles: retexData.pointsFaibles,
      lecons: retexData.lecons,
      actionsAmelioration: retexData.actionsAmelioration,
      ecartPrix,
      ajustementScoring: retexData.ajustementScoring,
    };

    // Persist RETEX as JSON in aoAnalyse
    if (tender.aoAnalyse) {
      await prismaAny.aoAnalyse.update({
        where: { id: tender.aoAnalyse.id },
        data: {
          status: 'completed',
          currentStep: null,
          decision: resultat === 'GAGNE' ? 'WON' : 'LOST',
          decisionReason: JSON.stringify(retex),
        },
      });
    }

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9g',
      eventType: 'retex_generated',
      payload: { tenderId, resultat },
      result: { pointsForts: retex.pointsForts.length, pointsFaibles: retex.pointsFaibles.length, lecons: retex.lecons.length },
      durationMs: Date.now() - startTime,
    });

    this.logger.log({ msg: 'RETEX generated', tenderId, resultat });

    return retex;
  }

  // ---------------------------------------------------------------------------
  // C29 — daily deadline alerting cron
  // ---------------------------------------------------------------------------
  @Cron('0 8 * * *')
  async checkUpcomingDeadlines(): Promise<void> {
    const now = new Date();
    const alerts = [5, 3, 1]; // days before deadline

    for (const daysLeft of alerts) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysLeft);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

      const tenders = await (this.prisma as any).publicTender.findMany({
        where: {
          deadlineDate: { gte: startOfDay, lte: endOfDay },
          status: { notIn: ['WON', 'LOST', 'IGNORED'] },
        },
      });

      for (const tender of tenders) {
        await this.processAlert({
          type: 'deadline_extended' as any,
          tenderId: tender.id,
          level: daysLeft <= 1 ? 3 : daysLeft <= 3 ? 2 : 1,
          message: `Deadline J-${daysLeft}: ${tender.title} — échéance ${tender.deadlineDate.toLocaleDateString('fr-FR')}`,
          actionRequired: daysLeft <= 1
            ? 'Soumettre le dossier IMMÉDIATEMENT'
            : `Vérifier que le dossier est complet (J-${daysLeft})`,
          createdAt: new Date(),
        });
      }
    }
  }

  async processAlert(alert: MonitorAlert): Promise<void> {
    const prismaAny = this.prisma as any;

    // Log the alert
    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9g',
      eventType: `process_alert_${alert.type}`,
      payload: { tenderId: alert.tenderId, type: alert.type, level: alert.level },
      result: { message: alert.message, actionRequired: alert.actionRequired },
      durationMs: 0,
    });

    switch (alert.level) {
      case 1:
        // Automatic: retry with more context, notify next agent
        await this.handleLevel1Alert(alert);
        break;
      case 2:
        // Jonathan notification: send Slack notification for decisions
        await this.handleLevel2Alert(alert);
        break;
      case 3:
        // Urgent: immediate Slack alert for critical issues
        await this.handleLevel3Alert(alert);
        break;
    }

    // Execute type-specific actions
    await this.executeAlertTypeActions(alert);
  }

  determineEscalationLevel(alertType: AlertType): EscalationLevel {
    const level1Types: AlertType[] = ['qr_published', 'deadline_extended', 'no_news_30d'];
    const level2Types: AlertType[] = ['dce_modified', 'procedure_collective', 'regulatory_change'];
    const level3Types: AlertType[] = ['result_won', 'result_lost'];

    if (level1Types.includes(alertType)) return 1;
    if (level2Types.includes(alertType)) return 2;
    if (level3Types.includes(alertType)) return 3;

    return 1;
  }

  private async generateR2181Letter(tender: any): Promise<string> {
    const today = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const companyName = this.config.get<string>('COMPANY_NAME') ?? 'Axiom Marketing';
    const companySiret = this.config.get<string>('COMPANY_SIRET') ?? 'À compléter';

    return `
${companyName}
SIRET : ${companySiret}

À l'attention du Pouvoir Adjudicateur
${tender.buyerName ?? 'Acheteur public'}

Le ${today}

Objet : Demande d'informations suite à l'attribution du marché
Référence marché : ${tender.sourceId ?? tender.id}
Intitulé : ${tender.title}

Madame, Monsieur,

Par la présente, nous vous prions de bien vouloir nous faire part des motifs
de la décision de ne pas retenir notre offre pour le marché mentionné en objet,
conformément aux dispositions de l'article R2181-3 du Code de la commande publique.

Nous sollicitons notamment :
- Les caractéristiques et avantages relatifs de l'offre retenue,
- Le nom du titulaire du marché,
- Notre classement dans la procédure,
- Les motifs précis pour lesquels notre offre n'a pas été retenue.

Ces informations nous permettront d'améliorer la qualité de nos futures candidatures
et de mieux répondre aux attentes des acheteurs publics.

Nous vous remercions par avance de l'attention que vous porterez à notre demande
et restons à votre disposition pour tout renseignement complémentaire.

Dans l'attente de votre réponse, veuillez agréer, Madame, Monsieur, l'expression
de nos salutations distinguées.

${companyName}
    `.trim();
  }

  private determinePhase(daysSinceSubmission: number): 'ACTIVE' | 'ATTENTE' | 'RESULTAT' {
    if (daysSinceSubmission <= PHASE_THRESHOLDS.ACTIVE) return 'ACTIVE';
    if (daysSinceSubmission <= PHASE_THRESHOLDS.ATTENTE) return 'ATTENTE';
    return 'RESULTAT';
  }

  private resolveSubmissionDate(tender: any): Date | null {
    // Try to find submission date from various fields
    const candidate = tender.submittedAt ?? tender.deadlineDate ?? tender.updatedAt;
    return candidate ? new Date(candidate) : null;
  }

  private async checkForNewQuestionsReplies(tender: any): Promise<boolean> {
    // Stub HTTP check — in production, polls BOAMP/PLACE/acheteurs-publics API
    this.logger.debug({ msg: 'Checking for new Q&R (stub)', tenderId: tender.id });
    return false;
  }

  private async checkForDceModification(tender: any): Promise<boolean> {
    // Stub HTTP check — in production, checks DCE timestamp on platform
    this.logger.debug({ msg: 'Checking for DCE modifications (stub)', tenderId: tender.id });
    return false;
  }

  private async hasExistingAlert(tenderId: string, alertType: AlertType): Promise<boolean> {
    // Check agent event log for existing alert of this type in last 24h
    const prismaAny = this.prisma as any;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await prismaAny.agentEventLog.findFirst({
      where: {
        agentName: 'agent-appels-offres:9g',
        eventType: `alert_${alertType}`,
        createdAt: { gte: since },
        payload: { path: ['tenderId'], equals: tenderId },
      },
    });
    return !!existing;
  }

  private async handleLevel1Alert(alert: MonitorAlert): Promise<void> {
    // Level 1: automatic retry with more context, notify next agent
    this.logger.log({
      msg: 'Level 1 alert — automatic handling',
      tenderId: alert.tenderId,
      type: alert.type,
    });
  }

  private async handleLevel2Alert(alert: MonitorAlert): Promise<void> {
    // Level 2: send Slack notification for Jonathan decisions
    const slackWebhook = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!slackWebhook) {
      this.logger.warn({ msg: 'Level 2 alert: SLACK_WEBHOOK_URL not configured', type: alert.type });
      return;
    }

    const payload = {
      text: `*[NIVEAU 2 — Action Jonathan requise]* ${alert.message}\n> ${alert.actionRequired}`,
      username: 'ProspectionAgentic — Agent 9g',
    };

    try {
      await this.httpService.axiosRef.post(slackWebhook, payload);
      this.logger.log({ msg: 'Level 2 Slack notification sent', type: alert.type });
    } catch (error) {
      this.logger.error({ msg: 'Failed to send Level 2 Slack notification', error: (error as Error).message });
    }
  }

  private async handleLevel3Alert(alert: MonitorAlert): Promise<void> {
    // Level 3: immediate Slack alert for critical issues
    const slackWebhook = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!slackWebhook) {
      this.logger.warn({ msg: 'Level 3 alert: SLACK_WEBHOOK_URL not configured', type: alert.type });
      return;
    }

    const payload = {
      text: `*[URGENT — NIVEAU 3]* :rotating_light: ${alert.message}\n> ${alert.actionRequired}`,
      username: 'ProspectionAgentic — Agent 9g URGENT',
    };

    try {
      await this.httpService.axiosRef.post(slackWebhook, payload);
      this.logger.log({ msg: 'Level 3 urgent Slack notification sent', type: alert.type });
    } catch (error) {
      this.logger.error({ msg: 'Failed to send Level 3 Slack notification', error: (error as Error).message });
    }
  }

  private async executeAlertTypeActions(alert: MonitorAlert): Promise<void> {
    switch (alert.type) {
      case 'qr_published':
        // Re-analyze DCE — update memoire if needed
        this.logger.log({ msg: 'Q&R published — re-analysis needed', tenderId: alert.tenderId });
        break;

      case 'dce_modified':
        // Re-launch 9a analysis, alert Jonathan
        this.logger.log({ msg: 'DCE modified — re-launch 9a analysis required', tenderId: alert.tenderId });
        break;

      case 'deadline_extended':
        // Update retroplanning
        this.logger.log({ msg: 'Deadline extended — update retroplanning', tenderId: alert.tenderId });
        break;

      case 'result_won':
        // Prepare AE signature + laureat docs → Agent 8/10
        this.logger.log({ msg: 'Result WON — prepare AE signature + transfer to Agent 8/10', tenderId: alert.tenderId });
        break;

      case 'result_lost':
        // R2181-3 letter + RETEX — handled by processResult
        this.logger.log({ msg: 'Result LOST — R2181-3 letter + RETEX initiated', tenderId: alert.tenderId });
        break;

      case 'debrief_received':
        // Structured RETEX analysis
        this.logger.log({ msg: 'Debrief received — structured RETEX analysis', tenderId: alert.tenderId });
        break;

      case 'no_news_30d':
        // Relance acheteur
        this.logger.log({ msg: 'No news 30d — relancer acheteur', tenderId: alert.tenderId });
        break;

      case 'procedure_collective':
        // Alert opportunity
        this.logger.log({ msg: 'Procedure collective — alert opportunity', tenderId: alert.tenderId });
        break;

      case 'regulatory_change':
        // Verify compliance
        this.logger.log({ msg: 'Regulatory change — verify compliance', tenderId: alert.tenderId });
        break;
    }
  }
}
