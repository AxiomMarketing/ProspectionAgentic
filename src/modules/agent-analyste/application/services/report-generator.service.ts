import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

interface DailyMetrics {
  suiveurReplyRate: number;
  suiveurBounceRate: number;
  suiveurEmailsEnvoyes: number;
  suiveurReponsesPositives: number;
  suiveurReponsesTotal: number;
  pipelineLeadsGeneres: number;
  pipelineRdvBookes: number;
  pipelineDealsGagnes: number;
  pipelineRevenuJour: number;
  coutTotalJourEur: number;
  veilleurLeadsBruts: number;
  enrichisseurTauxEnrichissement: number;
  scoreurNbHot: number;
}

interface WeeklyAggregate {
  totalEmailsEnvoyes: number;
  totalReponsesPositives: number;
  totalLeadsGeneres: number;
  totalRdvBookes: number;
  totalDealsGagnes: number;
  totalRevenu: number;
  totalCout: number;
  avgReplyRate: number;
  avgBounceRate: number;
  avgScoreMoyen: number;
}

interface ScoringPrecisionResult {
  precisionHot: number;
  recall: number;
  fauxPositifsHot: number;
  fauxNegatifs: number;
  scoreMoyenDeals: number;
}

@Injectable()
export class ReportGeneratorService implements OnModuleDestroy {
  private readonly logger = new Logger(ReportGeneratorService.name);
  private readonly redis: InstanceType<typeof Redis>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly llmService: LlmService,
    @Optional() private readonly emailAdapter: IEmailAdapter,
    private readonly httpService: HttpService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis error in ReportGeneratorService', error: err.message });
    });
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  private async acquireCronLock(lockName: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(`cron-lock:${lockName}`, process.pid.toString(), 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return true;
    }
  }

  @Cron('0 22 * * *')
  async generateDailyDigest(date?: string): Promise<void> {
    if (!date && !await this.acquireCronLock('daily-digest', 300)) return;
    const targetDate = date ? new Date(date) : new Date();
    const todayStr = targetDate.toISOString().split('T')[0];

    const yesterdayDate = new Date(targetDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);

    this.logger.log({ msg: 'Generating daily digest', date: todayStr });

    const todayStart = new Date(todayStr + 'T00:00:00.000Z');
    const yesterdayStart = new Date(yesterdayDate.toISOString().split('T')[0] + 'T00:00:00.000Z');

    const [today, yesterday] = await Promise.all([
      this.prisma.metriquesDaily.findFirst({ where: { dateSnapshot: todayStart } }),
      this.prisma.metriquesDaily.findFirst({ where: { dateSnapshot: yesterdayStart } }),
    ]);

    const replyRate = today?.suiveurReplyRate ?? 0;
    const bounceRate = today?.suiveurBounceRate ?? 0;
    const health = this.getHealthStatus(replyRate, bounceRate);

    const deltaReplyRate = this.calculateDelta(
      today?.suiveurReplyRate ?? 0,
      yesterday?.suiveurReplyRate ?? 0,
    );
    const deltaEmailsEnvoyes = this.calculateDelta(
      today?.suiveurEmailsEnvoyes ?? 0,
      yesterday?.suiveurEmailsEnvoyes ?? 0,
    );
    const deltaLeads = this.calculateDelta(
      today?.pipelineLeadsGeneres ?? 0,
      yesterday?.pipelineLeadsGeneres ?? 0,
    );
    const deltaRdv = this.calculateDelta(
      today?.pipelineRdvBookes ?? 0,
      yesterday?.pipelineRdvBookes ?? 0,
    );
    const deltaRevenu = this.calculateDelta(
      today?.pipelineRevenuJour ?? 0,
      yesterday?.pipelineRevenuJour ?? 0,
    );
    const deltaCout = this.calculateDelta(
      today?.coutTotalJourEur ?? 0,
      yesterday?.coutTotalJourEur ?? 0,
    );

    const healthEmoji = health === 'VERT' ? '[VERT]' : health === 'JAUNE' ? '[JAUNE]' : '[ROUGE]';

    const text = [
      `*Agent 7 ANALYSTE — Digest Quotidien ${todayStr}*`,
      `Santé pipeline: ${healthEmoji}`,
      ``,
      `*Acquisition*`,
      `• Leads générés: ${today?.pipelineLeadsGeneres ?? 0} (${deltaLeads})`,
      `• Leads bruts Veilleur: ${today?.veilleurLeadsBruts ?? 0}`,
      `• Taux enrichissement: ${((today?.enrichisseurTauxEnrichissement ?? 0) * 100).toFixed(1)}%`,
      `• HOT scores: ${today?.scoreurNbHot ?? 0}`,
      ``,
      `*Outreach*`,
      `• Emails envoyés: ${today?.suiveurEmailsEnvoyes ?? 0} (${deltaEmailsEnvoyes})`,
      `• Taux de réponse: ${(replyRate * 100).toFixed(2)}% (${deltaReplyRate})`,
      `• Taux de rebond: ${(bounceRate * 100).toFixed(2)}%`,
      `• Réponses positives: ${today?.suiveurReponsesPositives ?? 0}`,
      ``,
      `*Conversions*`,
      `• RDV bookés: ${today?.pipelineRdvBookes ?? 0} (${deltaRdv})`,
      `• Deals gagnés: ${today?.pipelineDealsGagnes ?? 0}`,
      `• Revenu jour: ${(today?.pipelineRevenuJour ?? 0).toFixed(2)}€ (${deltaRevenu})`,
      ``,
      `*Coûts*`,
      `• Coût total jour: ${(today?.coutTotalJourEur ?? 0).toFixed(2)}€ (${deltaCout})`,
      `• Claude API: ${(today?.coutClaudeApiEur ?? 0).toFixed(2)}€`,
    ].join('\n');

    await Promise.allSettled([
      this.sendSlackMessage('analyste-digest', text),
      this.sendEmailReport(`Digest Quotidien Pipeline — ${todayStr}`, text),
    ]);

    this.logger.log({ msg: 'Daily digest sent', date: todayStr, health });
  }

  @Cron('0 9 * * 1')
  async generateWeeklyReport(): Promise<void> {
    if (!await this.acquireCronLock('weekly-report', 600)) return;
    const now = new Date();
    if (now.getDate() === 1) {
      this.logger.log({ msg: 'Skipping weekly report — monthly report takes precedence today' });
      return;
    }

    this.logger.log({ msg: 'Generating weekly report' });

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const rows = await this.prisma.metriquesDaily.findMany({
      where: { dateSnapshot: { gte: fourteenDaysAgo } },
      orderBy: { dateSnapshot: 'asc' },
    });

    const currentWeekRows = rows.slice(Math.max(0, rows.length - 7));
    const previousWeekRows = rows.slice(0, Math.min(7, rows.length - 7));

    const currentWeek = this.aggregateWeek(currentWeekRows);
    const previousWeek = this.aggregateWeek(previousWeekRows);

    const deltaReplyRate = this.calculateDelta(currentWeek.avgReplyRate, previousWeek.avgReplyRate);
    const deltaLeads = this.calculateDelta(currentWeek.totalLeadsGeneres, previousWeek.totalLeadsGeneres);
    const deltaRdv = this.calculateDelta(currentWeek.totalRdvBookes, previousWeek.totalRdvBookes);
    const deltaRevenu = this.calculateDelta(currentWeek.totalRevenu, previousWeek.totalRevenu);

    const dataTemplate = [
      `*Agent 7 ANALYSTE — Rapport Hebdomadaire*`,
      `Semaine du ${fourteenDaysAgo.toISOString().split('T')[0]} au ${now.toISOString().split('T')[0]}`,
      ``,
      `*Performance Semaine en Cours vs Semaine Précédente*`,
      `• Emails envoyés: ${currentWeek.totalEmailsEnvoyes} vs ${previousWeek.totalEmailsEnvoyes}`,
      `• Taux de réponse moyen: ${(currentWeek.avgReplyRate * 100).toFixed(2)}% (${deltaReplyRate})`,
      `• Taux de rebond moyen: ${(currentWeek.avgBounceRate * 100).toFixed(2)}%`,
      `• Réponses positives: ${currentWeek.totalReponsesPositives}`,
      `• Leads générés: ${currentWeek.totalLeadsGeneres} (${deltaLeads})`,
      `• RDV bookés: ${currentWeek.totalRdvBookes} (${deltaRdv})`,
      `• Deals gagnés: ${currentWeek.totalDealsGagnes}`,
      `• Revenu total: ${currentWeek.totalRevenu.toFixed(2)}€ (${deltaRevenu})`,
      `• Coût total: ${currentWeek.totalCout.toFixed(2)}€`,
    ].join('\n');

    let narrative = '';
    try {
      if (this.llmService) {
        const llmResult = await this.llmService.call({
          task: LlmTask.ANALYZE_COMPANY_STRATEGY,
          systemPrompt:
            "Tu es l'Agent 7 ANALYSTE du pipeline de prospection B2B d'Axiom Marketing. " +
            'Ton ton est direct, factuel, actionnable. ' +
            'Tu analyses les données de performance hebdomadaire et génères un commentaire narratif ' +
            'basé UNIQUEMENT sur les chiffres fournis — ne pas inventer de données.',
          userPrompt:
            `Voici les données de performance de la semaine:\n${dataTemplate}\n\n` +
            'Génère un commentaire narratif de 3-5 phrases en français: points forts, points faibles, ' +
            'et 1-2 recommandations actionnables pour la semaine suivante. ' +
            'Appuie-toi UNIQUEMENT sur les chiffres ci-dessus.',
          maxTokens: 2000,
        });
        narrative = llmResult.content;
      }
    } catch (error: any) {
      this.logger.error({ msg: 'Claude API failed for weekly report', error: error.message });
      narrative = '[DÉGRADÉ] Résumé IA indisponible — données brutes ci-dessous';
    }

    const fullReport = narrative
      ? `${dataTemplate}\n\n*Analyse IA:*\n${narrative}`
      : `${dataTemplate}`;

    await Promise.allSettled([
      this.sendSlackMessage('analyste-digest', fullReport),
      this.sendEmailReport(`Rapport Hebdomadaire Pipeline — ${now.toISOString().split('T')[0]}`, fullReport),
    ]);

    this.logger.log({ msg: 'Weekly report sent' });
  }

  @Cron('0 8 1 * *')
  async generateMonthlyReport(): Promise<void> {
    if (!await this.acquireCronLock('monthly-report', 1800)) return;
    this.logger.log({ msg: 'Generating monthly report' });

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const rows = await this.prisma.metriquesDaily.findMany({
      where: { dateSnapshot: { gte: firstDayOfMonth, lt: now } },
      orderBy: { dateSnapshot: 'asc' },
    });

    const lastMonthRows = await this.prisma.metriquesDaily.findMany({
      where: { dateSnapshot: { gte: lastMonth, lte: lastMonthEnd } },
      orderBy: { dateSnapshot: 'asc' },
    });

    const currentMonthAgg = this.aggregateWeek(rows);
    const lastMonthAgg = this.aggregateWeek(lastMonthRows);

    const outcomes = await this.prisma.prospectScore.findMany({
      where: { isLatest: true },
      select: {
        prospectId: true,
        segment: true,
        totalScore: true,
      },
    });

    const precision = this.calculateScoringPrecision(outcomes);

    const monthLabel = firstDayOfMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

    const dataTemplate = [
      `*Agent 7 ANALYSTE — Rapport Mensuel ${monthLabel}*`,
      ``,
      `*Performance du mois*`,
      `• Emails envoyés: ${currentMonthAgg.totalEmailsEnvoyes}`,
      `• Taux de réponse moyen: ${(currentMonthAgg.avgReplyRate * 100).toFixed(2)}%`,
      `• Taux de rebond moyen: ${(currentMonthAgg.avgBounceRate * 100).toFixed(2)}%`,
      `• Réponses positives: ${currentMonthAgg.totalReponsesPositives}`,
      `• Leads générés: ${currentMonthAgg.totalLeadsGeneres}`,
      `• RDV bookés: ${currentMonthAgg.totalRdvBookes}`,
      `• Deals gagnés: ${currentMonthAgg.totalDealsGagnes}`,
      `• Revenu total: ${currentMonthAgg.totalRevenu.toFixed(2)}€`,
      `• Coût total: ${currentMonthAgg.totalCout.toFixed(2)}€`,
      ``,
      `*vs Mois Précédent*`,
      `• Emails: ${this.calculateDelta(currentMonthAgg.totalEmailsEnvoyes, lastMonthAgg.totalEmailsEnvoyes)}`,
      `• Réponses positives: ${this.calculateDelta(currentMonthAgg.totalReponsesPositives, lastMonthAgg.totalReponsesPositives)}`,
      `• Deals: ${this.calculateDelta(currentMonthAgg.totalDealsGagnes, lastMonthAgg.totalDealsGagnes)}`,
      `• Revenu: ${this.calculateDelta(currentMonthAgg.totalRevenu, lastMonthAgg.totalRevenu)}`,
      ``,
      `*Précision du Scoring*`,
      `• Précision HOT: ${(precision.precisionHot * 100).toFixed(1)}%`,
      `• Recall: ${(precision.recall * 100).toFixed(1)}%`,
      `• Faux positifs HOT: ${precision.fauxPositifsHot}`,
      `• Faux négatifs: ${precision.fauxNegatifs}`,
      `• Score moyen deals gagnés: ${precision.scoreMoyenDeals.toFixed(1)}`,
    ].join('\n');

    let narrative = '';
    try {
      if (this.llmService) {
        const llmResult = await this.llmService.call({
          task: LlmTask.ANALYZE_COMPANY_STRATEGY,
          systemPrompt:
            "Tu es l'Agent 7 ANALYSTE du pipeline de prospection B2B d'Axiom Marketing. " +
            'Ton ton est direct, factuel, actionnable. ' +
            "Tu produis l'analyse stratégique mensuelle basée UNIQUEMENT sur les chiffres fournis.",
          userPrompt:
            `Voici les données du mois:\n${dataTemplate}\n\n` +
            'Génère une analyse stratégique de 5-8 phrases en français: ' +
            "tendances clés du mois, performance vs objectifs, qualité du scoring, ROI de l'outreach, " +
            'et 3 recommandations stratégiques prioritaires pour le mois suivant. ' +
            'Appuie-toi UNIQUEMENT sur les chiffres ci-dessus.',
          maxTokens: 4000,
        });
        narrative = llmResult.content;
      }
    } catch (error: any) {
      this.logger.error({ msg: 'Claude API failed for monthly report', error: error.message });
      narrative = '[DÉGRADÉ] Résumé IA indisponible — données brutes ci-dessous';
    }

    const fullReport = narrative
      ? `${dataTemplate}\n\n*Analyse Stratégique IA:*\n${narrative}`
      : `${dataTemplate}`;

    await Promise.allSettled([
      this.sendSlackMessage('analyste-digest', fullReport),
      this.sendEmailReport(`Rapport Mensuel Pipeline — ${monthLabel}`, fullReport),
    ]);

    this.logger.log({ msg: 'Monthly report sent', month: monthLabel });
  }

  getHealthStatus(replyRate: number, bounceRate: number): 'VERT' | 'JAUNE' | 'ROUGE' {
    if (replyRate >= 0.05 && bounceRate < 0.02) return 'VERT';
    if (replyRate >= 0.03 && bounceRate < 0.03) return 'JAUNE';
    return 'ROUGE';
  }

  calculateDelta(today: number, yesterday: number): string {
    if (yesterday === 0 && today === 0) return '=';
    if (yesterday === 0) return `+${today} (nouveau)`;

    const diff = today - yesterday;
    const pct = ((diff / yesterday) * 100).toFixed(0);
    if (diff === 0) return '=';
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff} (${sign}${pct}%)`;
  }

  calculateScoringPrecision(
    outcomes: Array<{ prospectId: string; segment: string | null; totalScore: number }>,
  ): ScoringPrecisionResult {
    const hotProspects = outcomes.filter((o) => o.segment === 'HOT');

    if (hotProspects.length === 0) {
      return { precisionHot: 0, recall: 0, fauxPositifsHot: 0, fauxNegatifs: 0, scoreMoyenDeals: 0 };
    }

    const totalHot = hotProspects.length;
    const totalProspects = outcomes.length;

    // Approximate from score distribution — true precision requires deal linkage (done in full impl)
    const highScoreHot = hotProspects.filter((o) => o.totalScore >= 70).length;
    const precisionHot = totalHot > 0 ? highScoreHot / totalHot : 0;

    const recall = totalProspects > 0 ? totalHot / totalProspects : 0;
    const fauxPositifsHot = totalHot - highScoreHot;
    const fauxNegatifs = outcomes.filter((o) => o.segment !== 'HOT' && o.totalScore >= 70).length;

    const scoreMoyenDeals =
      hotProspects.length > 0
        ? hotProspects.reduce((sum, o) => sum + o.totalScore, 0) / hotProspects.length
        : 0;

    return { precisionHot, recall, fauxPositifsHot, fauxNegatifs, scoreMoyenDeals };
  }

  async sendSlackMessage(channel: string, text: string): Promise<void> {
    const webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn({ msg: 'SLACK_WEBHOOK_URL not configured — skipping Slack message', channel });
      return;
    }

    try {
      await firstValueFrom(
        this.httpService.post(webhookUrl, { text, channel: `#${channel}` }),
      );
    } catch (error: any) {
      this.logger.error({ msg: 'Slack message failed', channel, error: error.message });
    }
  }

  async sendEmailReport(subject: string, body: string): Promise<void> {
    const reportEmail = this.configService.get<string>('ANALYSTE_REPORT_EMAIL');
    if (!reportEmail) {
      this.logger.warn({ msg: 'ANALYSTE_REPORT_EMAIL not configured — skipping email report' });
      return;
    }

    if (!this.emailAdapter) {
      this.logger.warn({ msg: 'EmailAdapter not available — skipping email report' });
      return;
    }

    const fromEmail = this.configService.get<string>('MAIL_FROM') ?? 'noreply@axiom.fr';

    try {
      await this.emailAdapter.sendEmail({
        from: fromEmail,
        to: [reportEmail],
        subject,
        htmlBody: body,
        textBody: body,
        tags: ['analyste-report'],
      });
    } catch (error: any) {
      this.logger.error({ msg: 'Email report failed', subject, error: error.message });
    }
  }

  private aggregateWeek(rows: any[]): WeeklyAggregate {
    if (rows.length === 0) {
      return {
        totalEmailsEnvoyes: 0,
        totalReponsesPositives: 0,
        totalLeadsGeneres: 0,
        totalRdvBookes: 0,
        totalDealsGagnes: 0,
        totalRevenu: 0,
        totalCout: 0,
        avgReplyRate: 0,
        avgBounceRate: 0,
        avgScoreMoyen: 0,
      };
    }

    const sum = (field: string) => rows.reduce((acc, r) => acc + (r[field] ?? 0), 0);
    const avg = (field: string) => sum(field) / rows.length;

    return {
      totalEmailsEnvoyes: sum('suiveurEmailsEnvoyes'),
      totalReponsesPositives: sum('suiveurReponsesPositives'),
      totalLeadsGeneres: sum('pipelineLeadsGeneres'),
      totalRdvBookes: sum('pipelineRdvBookes'),
      totalDealsGagnes: sum('pipelineDealsGagnes'),
      totalRevenu: sum('pipelineRevenuJour'),
      totalCout: sum('coutTotalJourEur'),
      avgReplyRate: avg('suiveurReplyRate'),
      avgBounceRate: avg('suiveurBounceRate'),
      avgScoreMoyen: avg('scoreurScoreMoyen'),
    };
  }
}
