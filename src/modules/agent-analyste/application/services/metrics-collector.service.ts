import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { Prisma } from '@prisma/client';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

type VeilleurMetrics = Pick<
  Prisma.MetriquesDailyCreateInput,
  | 'veilleurLeadsBruts'
  | 'veilleurLeadsLinkedin'
  | 'veilleurLeadsMarches'
  | 'veilleurLeadsWeb'
  | 'veilleurLeadsJobboards'
  | 'veilleurLeadsQualifies'
  | 'veilleurPreScoreMoyen'
  | 'veilleurTauxDeduplication'
  | 'veilleurCoutApiEur'
>;

type EnrichisseurMetrics = Pick<
  Prisma.MetriquesDailyCreateInput,
  | 'enrichisseurProspectsTraites'
  | 'enrichisseurEmailsTrouves'
  | 'enrichisseurEmailsNonTrouves'
  | 'enrichisseurTauxEnrichissement'
  | 'enrichisseurTauxEmailValide'
  | 'enrichisseurTempsMoyenMs'
  | 'enrichisseurCoutApiEur'
>;

type ScoreurMetrics = Pick<
  Prisma.MetriquesDailyCreateInput,
  | 'scoreurProspectsScores'
  | 'scoreurNbHot'
  | 'scoreurNbWarm'
  | 'scoreurNbCold'
  | 'scoreurNbDisqualifie'
  | 'scoreurScoreMoyen'
  | 'scoreurPctHot'
  | 'scoreurPctWarm'
  | 'scoreurPctCold'
  | 'scoreurPctDisqualifie'
  | 'scoreurReclassifications'
>;

type RedacteurMetrics = Pick<
  Prisma.MetriquesDailyCreateInput,
  | 'redacteurMessagesGeneres'
  | 'redacteurCoutGenerationEur'
  | 'redacteurTempsMoyenGenerationMs'
  | 'redacteurTemplatesActifs'
  | 'redacteurAbTestsEnCours'
>;

type SuiveurMetrics = Pick<
  Prisma.MetriquesDailyCreateInput,
  | 'suiveurEmailsEnvoyes'
  | 'suiveurLinkedinConnections'
  | 'suiveurLinkedinMessages'
  | 'suiveurEmailsBounced'
  | 'suiveurBounceRate'
  | 'suiveurReponsesTotal'
  | 'suiveurReponsesPositives'
  | 'suiveurReponsesNegatives'
  | 'suiveurReponsesPasMaintenant'
  | 'suiveurReplyRate'
  | 'suiveurPositiveReplyRate'
  | 'suiveurSequencesActives'
  | 'suiveurSequencesCompletees'
  | 'suiveurSlaBreaches'
  | 'suiveurOptOuts'
  | 'suiveurCoutEur'
>;

type NurtureurMetrics = Pick<
  Prisma.MetriquesDailyCreateInput,
  | 'nurtureurTotalEnNurture'
  | 'nurtureurNouveauxEntres'
  | 'nurtureurEmailsNurtureEnvoyes'
  | 'nurtureurTauxOuverture'
  | 'nurtureurTauxClic'
  | 'nurtureurReclassifiesHot'
  | 'nurtureurSunset'
  | 'nurtureurOptOuts'
  | 'nurtureurEngagementScoreMoyen'
  | 'nurtureurCoutEur'
>;

type PipelineMetrics = Pick<
  Prisma.MetriquesDailyCreateInput,
  | 'pipelineProspectsContactes'
  | 'pipelineReponsesPositives'
  | 'pipelineRdvBookes'
  | 'pipelinePropositionsEnvoyees'
  | 'pipelineDealsGagnes'
  | 'pipelineDealsPerdus'
  | 'pipelineRevenuJour'
  | 'pipelineValeurTotale'
  | 'pipelineVelocityJour'
>;

@Injectable()
export class MetricsCollectorService implements OnModuleDestroy {
  private readonly logger = new Logger(MetricsCollectorService.name);
  private readonly redis: InstanceType<typeof Redis>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis error in MetricsCollectorService', error: err.message });
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

  @Cron('30 21 * * *', { name: 'daily-snapshot' })
  async collectDailySnapshot(date?: string): Promise<void> {
    if (!date && !await this.acquireCronLock('daily-snapshot', 300)) return;
    const snapshotDate = date || new Date().toISOString().split('T')[0];
    const startTime = Date.now();
    this.logger.log({ msg: 'Collecting daily snapshot', date: snapshotDate });

    const dayStart = new Date(snapshotDate + 'T00:00:00Z');
    const dayEnd = new Date(snapshotDate + 'T23:59:59.999Z');

    const [veilleur, enrichisseur, scoreur, redacteur, suiveur, nurtureur, pipeline] = await Promise.all([
      this.collectVeilleurMetrics(dayStart, dayEnd),
      this.collectEnrichisseurMetrics(dayStart, dayEnd),
      this.collectScoreurMetrics(dayStart, dayEnd),
      this.collectRedacteurMetrics(dayStart, dayEnd),
      this.collectSuiveurMetrics(dayStart, dayEnd),
      this.collectNurtureurMetrics(dayStart, dayEnd),
      this.collectPipelineMetrics(dayStart, dayEnd),
    ]);

    const coutTotal =
      (veilleur.veilleurCoutApiEur || 0) +
      (enrichisseur.enrichisseurCoutApiEur || 0) +
      (suiveur.suiveurCoutEur || 0) +
      (nurtureur.nurtureurCoutEur || 0);

    await this.prisma.metriquesDaily.upsert({
      where: { dateSnapshot: new Date(snapshotDate) },
      update: {
        ...veilleur,
        ...enrichisseur,
        ...scoreur,
        ...redacteur,
        ...suiveur,
        ...nurtureur,
        ...pipeline,
        pipelineLeadsGeneres: veilleur.veilleurLeadsBruts || 0,
        coutTotalJourEur: coutTotal,
        coutClaudeApiEur: redacteur.redacteurCoutGenerationEur || 0,
        coutApisExternesEur: (veilleur.veilleurCoutApiEur || 0) + (enrichisseur.enrichisseurCoutApiEur || 0),
        coutInfrastructureEur: coutTotal * 0.1,
      },
      create: {
        dateSnapshot: new Date(snapshotDate),
        ...veilleur,
        ...enrichisseur,
        ...scoreur,
        ...redacteur,
        ...suiveur,
        ...nurtureur,
        ...pipeline,
        pipelineLeadsGeneres: veilleur.veilleurLeadsBruts || 0,
        coutTotalJourEur: coutTotal,
        coutClaudeApiEur: redacteur.redacteurCoutGenerationEur || 0,
        coutApisExternesEur: (veilleur.veilleurCoutApiEur || 0) + (enrichisseur.enrichisseurCoutApiEur || 0),
        coutInfrastructureEur: coutTotal * 0.1,
      },
    });

    const durationMs = Date.now() - startTime;
    this.logger.log({ msg: 'Daily snapshot complete', date: snapshotDate, durationMs });
    await this.agentEventLogger.log({ agentName: 'analyste', eventType: 'daily_snapshot', durationMs });
  }

  private async collectVeilleurMetrics(dayStart: Date, dayEnd: Date): Promise<VeilleurMetrics> {
    const [sourceGroups, totalLeads, preScoreAgg] = await Promise.all([
      this.prisma.rawLead.groupBy({
        by: ['source'],
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _count: { id: true },
      }),
      this.prisma.rawLead.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
      this.prisma.prospectScore.aggregate({
        where: { calculatedAt: { gte: dayStart, lte: dayEnd }, isLatest: true },
        _avg: { totalScore: true },
        _count: { id: true },
      }),
    ]);

    const bySource = (sourceName: string) =>
      sourceGroups.find((g) => g.source?.toLowerCase().includes(sourceName))?._count.id ?? 0;

    const duplicates = await this.prisma.rawLead.count({
      where: { createdAt: { gte: dayStart, lte: dayEnd }, processed: false },
    });
    const tauxDeduplication = totalLeads > 0 ? (duplicates / totalLeads) * 100 : 0;

    return {
      veilleurLeadsBruts: totalLeads,
      veilleurLeadsLinkedin: bySource('linkedin'),
      veilleurLeadsMarches: bySource('boamp') + bySource('marche') + bySource('tender'),
      veilleurLeadsWeb: bySource('web') + bySource('scraping'),
      veilleurLeadsJobboards: bySource('job') + bySource('indeed') + bySource('hellowork'),
      veilleurLeadsQualifies: preScoreAgg._count.id,
      veilleurPreScoreMoyen: preScoreAgg._avg.totalScore ?? 0,
      veilleurTauxDeduplication: tauxDeduplication,
      veilleurCoutApiEur: 0,
    };
  }

  private async collectEnrichisseurMetrics(dayStart: Date, dayEnd: Date): Promise<EnrichisseurMetrics> {
    const [enriched, withEmail, withoutEmail, avgDuration] = await Promise.all([
      this.prisma.prospect.count({
        where: {
          enrichedAt: { gte: dayStart, lte: dayEnd },
          status: { not: 'raw' },
        },
      }),
      this.prisma.prospect.count({
        where: {
          enrichedAt: { gte: dayStart, lte: dayEnd },
          email: { not: null },
          emailVerified: true,
        },
      }),
      this.prisma.prospect.count({
        where: {
          enrichedAt: { gte: dayStart, lte: dayEnd },
          email: null,
        },
      }),
      this.prisma.agentEvent.aggregate({
        where: {
          agentName: 'enrichisseur',
          createdAt: { gte: dayStart, lte: dayEnd },
          durationMs: { not: null },
        },
        _avg: { durationMs: true },
      }),
    ]);

    const total = enriched;
    const tauxEnrichissement = total > 0 ? (withEmail / total) * 100 : 0;
    const tauxEmailValide = withEmail + withoutEmail > 0 ? (withEmail / (withEmail + withoutEmail)) * 100 : 0;

    return {
      enrichisseurProspectsTraites: total,
      enrichisseurEmailsTrouves: withEmail,
      enrichisseurEmailsNonTrouves: withoutEmail,
      enrichisseurTauxEnrichissement: tauxEnrichissement,
      enrichisseurTauxEmailValide: tauxEmailValide,
      enrichisseurTempsMoyenMs: Math.round(avgDuration._avg.durationMs ?? 0),
      enrichisseurCoutApiEur: 0,
    };
  }

  private async collectScoreurMetrics(dayStart: Date, dayEnd: Date): Promise<ScoreurMetrics> {
    const [scoreGroups, scoreAgg] = await Promise.all([
      this.prisma.prospectScore.groupBy({
        by: ['segment'],
        where: { calculatedAt: { gte: dayStart, lte: dayEnd }, isLatest: true },
        _count: { id: true },
      }),
      this.prisma.prospectScore.aggregate({
        where: { calculatedAt: { gte: dayStart, lte: dayEnd }, isLatest: true },
        _avg: { totalScore: true },
        _count: { id: true },
      }),
    ]);

    const bySegment = (seg: string) =>
      scoreGroups.find((g) => g.segment?.toLowerCase() === seg)?._count.id ?? 0;

    const total = scoreAgg._count.id;
    const nbHot = bySegment('hot');
    const nbWarm = bySegment('warm');
    const nbCold = bySegment('cold');
    const nbDisqualifie = bySegment('disqualifie') + bySegment('disqualified');

    return {
      scoreurProspectsScores: total,
      scoreurNbHot: nbHot,
      scoreurNbWarm: nbWarm,
      scoreurNbCold: nbCold,
      scoreurNbDisqualifie: nbDisqualifie,
      scoreurScoreMoyen: scoreAgg._avg.totalScore ?? 0,
      scoreurPctHot: total > 0 ? (nbHot / total) * 100 : 0,
      scoreurPctWarm: total > 0 ? (nbWarm / total) * 100 : 0,
      scoreurPctCold: total > 0 ? (nbCold / total) * 100 : 0,
      scoreurPctDisqualifie: total > 0 ? (nbDisqualifie / total) * 100 : 0,
      scoreurReclassifications: 0,
    };
  }

  private async collectRedacteurMetrics(dayStart: Date, dayEnd: Date): Promise<RedacteurMetrics> {
    const [msgAgg, templatesActifs, abTestsEnCours] = await Promise.all([
      this.prisma.generatedMessage.aggregate({
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _count: { id: true },
        _avg: { costEur: true, generationMs: true },
        _sum: { costEur: true },
      }),
      this.prisma.messageTemplate.count({ where: { isActive: true } }),
      this.prisma.abTest.count({ where: { status: 'running' } }),
    ]);

    return {
      redacteurMessagesGeneres: msgAgg._count.id,
      redacteurCoutGenerationEur: msgAgg._sum.costEur ?? 0,
      redacteurTempsMoyenGenerationMs: Math.round(msgAgg._avg.generationMs ?? 0),
      redacteurTemplatesActifs: templatesActifs,
      redacteurAbTestsEnCours: abTestsEnCours,
    };
  }

  private async collectSuiveurMetrics(dayStart: Date, dayEnd: Date): Promise<SuiveurMetrics> {
    const [emailGroups, replyGroups, linkedinGroups, sequenceActive, sequenceCompleted, bounceEvents] =
      await Promise.all([
        this.prisma.emailSend.groupBy({
          by: ['status'],
          where: { createdAt: { gte: dayStart, lte: dayEnd } },
          _count: { id: true },
        }),
        this.prisma.replyClassification.groupBy({
          by: ['sentiment'],
          where: { createdAt: { gte: dayStart, lte: dayEnd } },
          _count: { id: true },
        }),
        this.prisma.linkedinAction.groupBy({
          by: ['actionType'],
          where: { createdAt: { gte: dayStart, lte: dayEnd } },
          _count: { id: true },
        }),
        this.prisma.prospectSequence.count({
          where: { status: 'active', startedAt: { lte: dayEnd } },
        }),
        this.prisma.prospectSequence.count({
          where: { completedAt: { gte: dayStart, lte: dayEnd } },
        }),
        this.prisma.bounceEvent.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
      ]);

    const countByStatus = (status: string) =>
      emailGroups.find((g) => g.status === status)?._count.id ?? 0;
    const countBySentiment = (sentiment: string) =>
      replyGroups.find((g) => g.sentiment === sentiment)?._count.id ?? 0;
    const countByAction = (action: string) =>
      linkedinGroups.find((g) => g.actionType === action)?._count.id ?? 0;

    const emailsSent = countByStatus('sent') + countByStatus('delivered') + countByStatus('opened') + countByStatus('clicked') + countByStatus('replied');
    const reponsesTotal = replyGroups.reduce((sum, g) => sum + g._count.id, 0);
    const reponsesPositives = countBySentiment('positive');
    const reponsesNegatives = countBySentiment('negative');
    const reponsesPasMaintenant = countBySentiment('neutral') + countBySentiment('out_of_office');
    const replyRate = emailsSent > 0 ? (reponsesTotal / emailsSent) * 100 : 0;
    const positiveReplyRate = emailsSent > 0 ? (reponsesPositives / emailsSent) * 100 : 0;
    const bounceRate = emailsSent > 0 ? (bounceEvents / emailsSent) * 100 : 0;

    const slaBreaches = await this.prisma.agentEvent.count({
      where: {
        agentName: 'suiveur',
        eventType: 'sla_breach',
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });

    const optOuts = await this.prisma.emailSend.count({
      where: {
        unsubscribedAt: { gte: dayStart, lte: dayEnd },
      },
    });

    return {
      suiveurEmailsEnvoyes: emailsSent,
      suiveurLinkedinConnections: countByAction('connection_request'),
      suiveurLinkedinMessages: countByAction('message') + countByAction('inmail'),
      suiveurEmailsBounced: bounceEvents,
      suiveurBounceRate: bounceRate,
      suiveurReponsesTotal: reponsesTotal,
      suiveurReponsesPositives: reponsesPositives,
      suiveurReponsesNegatives: reponsesNegatives,
      suiveurReponsesPasMaintenant: reponsesPasMaintenant,
      suiveurReplyRate: replyRate,
      suiveurPositiveReplyRate: positiveReplyRate,
      suiveurSequencesActives: sequenceActive,
      suiveurSequencesCompletees: sequenceCompleted,
      suiveurSlaBreaches: slaBreaches,
      suiveurOptOuts: optOuts,
      suiveurCoutEur: 0,
    };
  }

  private async collectNurtureurMetrics(dayStart: Date, dayEnd: Date): Promise<NurtureurMetrics> {
    const [totalActive, nouveauxEntres, interactions, reclassifiesHot, sunset, optOuts, engagementAgg] =
      await Promise.all([
        this.prisma.nurtureProspect.count({ where: { status: 'active' } }),
        this.prisma.nurtureProspect.count({
          where: { entryDate: { gte: dayStart, lte: dayEnd } },
        }),
        this.prisma.nurtureInteraction.findMany({
          where: { createdAt: { gte: dayStart, lte: dayEnd } },
          select: { opened: true, clicked: true },
        }),
        this.prisma.nurtureProspect.count({
          where: { reactivatedAt: { gte: dayStart, lte: dayEnd }, status: 'reactivated' },
        }),
        this.prisma.nurtureProspect.count({
          where: { exitReason: 'sunset', updatedAt: { gte: dayStart, lte: dayEnd } },
        }),
        this.prisma.nurtureProspect.count({
          where: { optOutAt: { gte: dayStart, lte: dayEnd } },
        }),
        this.prisma.nurtureProspect.aggregate({
          where: { status: 'active' },
          _avg: { engagementScoreCurrent: true },
        }),
      ]);

    const emailsNurtureEnvoyes = interactions.length;
    const opened = interactions.filter((i) => i.opened).length;
    const clicked = interactions.filter((i) => i.clicked).length;
    const tauxOuverture = emailsNurtureEnvoyes > 0 ? (opened / emailsNurtureEnvoyes) * 100 : 0;
    const tauxClic = emailsNurtureEnvoyes > 0 ? (clicked / emailsNurtureEnvoyes) * 100 : 0;

    return {
      nurtureurTotalEnNurture: totalActive,
      nurtureurNouveauxEntres: nouveauxEntres,
      nurtureurEmailsNurtureEnvoyes: emailsNurtureEnvoyes,
      nurtureurTauxOuverture: tauxOuverture,
      nurtureurTauxClic: tauxClic,
      nurtureurReclassifiesHot: reclassifiesHot,
      nurtureurSunset: sunset,
      nurtureurOptOuts: optOuts,
      nurtureurEngagementScoreMoyen: engagementAgg._avg.engagementScoreCurrent ?? 0,
      nurtureurCoutEur: 0,
    };
  }

  private async collectPipelineMetrics(dayStart: Date, dayEnd: Date): Promise<PipelineMetrics> {
    const [dealGroups, revenuAgg, valeurTotale] = await Promise.all([
      this.prisma.dealCrm.groupBy({
        by: ['stage'],
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _count: { id: true },
        _sum: { amountEur: true },
      }),
      this.prisma.dealCrm.aggregate({
        where: { closedAt: { gte: dayStart, lte: dayEnd }, stage: 'GAGNE' },
        _sum: { amountEur: true },
        _count: { id: true },
      }),
      this.prisma.dealCrm.aggregate({
        where: { stage: { in: ['QUALIFICATION', 'DEVIS_CREE', 'NEGOCIATION'] } },
        _sum: { amountEur: true },
      }),
    ]);

    const countByStage = (stage: string) =>
      dealGroups.find((g) => g.stage === stage)?._count.id ?? 0;

    const dealsGagnes = revenuAgg._count?.id ?? 0;
    const dealsPerdus = countByStage('PERDU');
    const revenuJour = revenuAgg._sum?.amountEur ?? 0;
    const valeurTotale_ = valeurTotale._sum?.amountEur ?? 0;

    const prospectsContactes = await this.prisma.prospect.count({
      where: {
        status: 'contacted',
        updatedAt: { gte: dayStart, lte: dayEnd },
      },
    });

    const reponsesPositives = await this.prisma.replyClassification.count({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        sentiment: 'positive',
      },
    });

    const rdvBookes = await this.prisma.prospect.count({
      where: {
        status: 'meeting_booked',
        updatedAt: { gte: dayStart, lte: dayEnd },
      },
    });

    const propositionsEnvoyees = countByStage('proposal');

    return {
      pipelineProspectsContactes: prospectsContactes,
      pipelineReponsesPositives: reponsesPositives,
      pipelineRdvBookes: rdvBookes,
      pipelinePropositionsEnvoyees: propositionsEnvoyees,
      pipelineDealsGagnes: dealsGagnes,
      pipelineDealsPerdus: dealsPerdus,
      pipelineRevenuJour: revenuJour,
      pipelineValeurTotale: valeurTotale_,
      pipelineVelocityJour: revenuJour,
    };
  }
}
