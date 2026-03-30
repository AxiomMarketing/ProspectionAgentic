import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

const AGENT_NAMES = [
  { name: 'veilleur', displayName: 'Veilleur' },
  { name: 'enrichisseur', displayName: 'Enrichisseur' },
  { name: 'scoreur', displayName: 'Scoreur' },
  { name: 'redacteur', displayName: 'Rédacteur' },
  { name: 'suiveur', displayName: 'Suiveur' },
  { name: 'nurtureur', displayName: 'Nurtureur' },
  { name: 'analyste', displayName: 'Analyste' },
  { name: 'dealmaker', displayName: 'Dealmaker' },
  { name: 'appels-offres', displayName: 'Appels d\'Offres' },
  { name: 'csm', displayName: 'CSM' },
] as const;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.VEILLEUR_PIPELINE) private readonly veilleurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ENRICHISSEUR_PIPELINE) private readonly enrichisseurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SCOREUR_PIPELINE) private readonly scoreurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUIVEUR_PIPELINE) private readonly suiveurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NURTURER_PIPELINE) private readonly nurturerQueue: Queue,
  ) {}

  async getPipelineMetrics() {
    const [prospectsByStatus, totalProspects, totalEmails, totalScored] = await Promise.all([
      this.prisma.prospect.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.prospect.count(),
      this.prisma.emailSend.count(),
      this.prisma.prospectScore.count(),
    ]);

    const statusMap = Object.fromEntries(
      prospectsByStatus.map((r) => [r.status, r._count._all]),
    );

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const costResult = await this.prisma.generatedMessage.aggregate({
      _sum: { costEur: true },
      where: { createdAt: { gte: todayStart } },
    });

    const [emailsOpened, repliesReceived] = await Promise.all([
      this.prisma.emailSend.count({ where: { openedAt: { not: null }, createdAt: { gte: todayStart } } }),
      this.prisma.emailSend.count({ where: { repliedAt: { not: null }, createdAt: { gte: todayStart } } }),
    ]);

    return {
      leadsDetected: totalProspects,
      leadsEnriched: statusMap['ENRICHED'] ?? statusMap['enriched'] ?? 0,
      leadsHot: statusMap['QUALIFIED'] ?? statusMap['qualified'] ?? 0,
      emailsSent: totalEmails,
      emailsOpened,
      repliesReceived,
      llmCostEur: costResult._sum.costEur ?? 0,
      tendersDetected: 0,
      dealsCreated: 0,
      prospectsByStatus: statusMap,
    };
  }

  async getAgentStatuses() {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const events = await this.prisma.agentEvent.groupBy({
      by: ['agentName'],
      _count: { _all: true },
      _max: { createdAt: true },
      where: { createdAt: { gte: since } },
    });

    const eventMap = new Map(
      events.map((e) => [e.agentName, { count: e._count._all, lastSeen: e._max.createdAt }]),
    );

    return AGENT_NAMES.map((agent) => {
      const activity = eventMap.get(agent.name);
      return {
        name: agent.name,
        displayName: agent.displayName,
        status: activity ? 'running' : 'idle',
        lastActivity: activity?.lastSeen?.toISOString() ?? null,
        throughput: activity ? `${activity.count} evt/h` : '—',
        errorCount: 0,
        uptime: 100,
      };
    });
  }

  async getRecentEvents(limit = 50) {
    return this.prisma.agentEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getAgentEvents(agentName: string, limit = 100) {
    return this.prisma.agentEvent.findMany({
      where: { agentName },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getVeilleurSubAgentStatus() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const subAgents = [
      {
        name: 'linkedin',
        displayName: 'LinkedIn',
        eventTypePatterns: ['1a_linkedin'],
        cron: '0 */6 * * *',
      },
      {
        name: 'boamp',
        displayName: 'BOAMP',
        eventTypePatterns: ['1b_marches', 'scan_started'],
        cron: '0 */4 * * *',
      },
      {
        name: 'web',
        displayName: 'Veille Web',
        eventTypePatterns: ['1c_web'],
        cron: '0 */8 * * *',
      },
      {
        name: 'jobboards',
        displayName: 'Job Boards',
        eventTypePatterns: ['1d_jobboards'],
        cron: '0 */12 * * *',
      },
    ];

    return Promise.all(
      subAgents.map(async (sa) => {
        const [lastEvent, leadsProduced, errorsLast24h] = await Promise.all([
          this.prisma.agentEvent.findFirst({
            where: {
              agentName: 'veilleur',
              eventType: { in: sa.eventTypePatterns },
            },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.agentEvent.count({
            where: {
              agentName: 'veilleur',
              eventType: { in: sa.eventTypePatterns },
              errorMessage: null,
            },
          }),
          this.prisma.agentEvent.count({
            where: {
              agentName: 'veilleur',
              eventType: { in: sa.eventTypePatterns },
              errorMessage: { not: null },
              createdAt: { gte: since24h },
            },
          }),
        ]);

        const isRunning = lastEvent
          ? Date.now() - new Date(lastEvent.createdAt).getTime() < 30 * 60 * 1000
          : false;

        const status = errorsLast24h > 0 && !isRunning ? 'error' : isRunning ? 'running' : 'idle';

        const nextScheduledRun = this.calculateNextCronRun(sa.cron);

        return {
          name: sa.name,
          displayName: sa.displayName,
          status,
          lastRunAt: lastEvent?.createdAt?.toISOString() ?? null,
          leadsProduced,
          errorsLast24h,
          nextScheduledRun,
        };
      }),
    );
  }

  private calculateNextCronRun(cron: string): string {
    // Parse simple cron patterns like "0 */4 * * *"
    const parts = cron.split(' ');
    if (parts.length !== 5) return new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const hourPart = parts[1];
    const now = new Date();

    if (hourPart.startsWith('*/')) {
      const interval = parseInt(hourPart.slice(2), 10);
      if (!isNaN(interval) && interval > 0) {
        const currentHour = now.getHours();
        const nextHour = Math.ceil((currentHour + 1) / interval) * interval;
        const next = new Date(now);
        next.setMinutes(0, 0, 0);
        if (nextHour >= 24) {
          next.setDate(next.getDate() + 1);
          next.setHours(0);
        } else {
          next.setHours(nextHour);
        }
        return next.toISOString();
      }
    }

    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  async getEnrichisseurMetrics() {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      enriched24h,
      enriched7d,
      excluded30d,
      errorEvents30d,
      emailCoverage,
      avgDuration,
    ] = await Promise.all([
      this.prisma.agentEvent.count({
        where: {
          agentName: 'enrichisseur',
          eventType: 'prospect_enriched',
          errorMessage: null,
          createdAt: { gte: since24h },
        },
      }),
      this.prisma.agentEvent.count({
        where: {
          agentName: 'enrichisseur',
          eventType: 'prospect_enriched',
          errorMessage: null,
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.agentEvent.groupBy({
        by: ['eventType'],
        _count: { _all: true },
        where: {
          agentName: 'enrichisseur',
          eventType: { in: ['prospect_excluded', 'enrichment_error'] },
          createdAt: { gte: since30d },
        },
      }),
      this.prisma.agentEvent.count({
        where: {
          agentName: 'enrichisseur',
          errorMessage: { not: null },
          createdAt: { gte: since30d },
        },
      }),
      this.prisma.prospect.aggregate({
        _count: { _all: true },
        where: { enrichedAt: { not: null } },
      }),
      this.prisma.agentEvent.aggregate({
        _avg: { durationMs: true },
        where: {
          agentName: 'enrichisseur',
          eventType: 'prospect_enriched',
          durationMs: { not: null },
          createdAt: { gte: since30d },
        },
      }),
    ]);

    const totalEnriched = emailCoverage._count._all;
    const verifiedCount = await this.prisma.prospect.count({
      where: { enrichedAt: { not: null }, emailVerified: true },
    });
    const notFoundCount = await this.prisma.prospect.count({
      where: { enrichedAt: { not: null }, email: null },
    });
    const catchAllCount = totalEnriched - verifiedCount - notFoundCount;

    const excludedMap = Object.fromEntries(
      excluded30d.map((r) => [r.eventType, r._count._all]),
    );

    const excludedEvents = await this.prisma.agentEvent.findMany({
      where: {
        agentName: 'enrichisseur',
        eventType: 'prospect_excluded',
        createdAt: { gte: since30d },
      },
      select: { payload: true },
    });

    const exclusionReasons = { procedureCollective: 0, entrepriseFermee: 0, rgpd: 0 };
    for (const ev of excludedEvents) {
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const reason = payload['reason'];
      if (reason === 'procedure_collective') exclusionReasons.procedureCollective++;
      else if (reason === 'entreprise_fermee') exclusionReasons.entrepriseFermee++;
      else if (reason === 'rgpd') exclusionReasons.rgpd++;
    }

    return {
      totalEnriched24h: enriched24h,
      totalEnriched7d: enriched7d,
      emailCoverage: {
        verified: verifiedCount,
        catchAll: catchAllCount < 0 ? 0 : catchAllCount,
        notFound: notFoundCount,
        total: totalEnriched,
      },
      avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
      exclusions: exclusionReasons,
      errorsLast30d: errorEvents30d,
      totalExcluded30d: excludedMap['prospect_excluded'] ?? 0,
    };
  }

  async getEnrichisseurSubAgentStatus() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const subAgents = [
      {
        name: '2a-contact',
        displayName: '2a Contact (Hunter)',
        eventTypePatterns: ['2a_contact', 'contact_found', 'contact_not_found'],
      },
      {
        name: '2b-entreprise',
        displayName: '2b Entreprise (Pappers)',
        eventTypePatterns: ['2b_entreprise', 'company_enriched', 'company_not_found'],
      },
      {
        name: '2c-technique',
        displayName: '2c Technique (Wappalyzer)',
        eventTypePatterns: ['2c_technique', 'tech_stack_found', 'tech_stack_error'],
      },
    ];

    return Promise.all(
      subAgents.map(async (sa) => {
        const [lastEvent, successCount, errorsLast24h] = await Promise.all([
          this.prisma.agentEvent.findFirst({
            where: {
              agentName: 'enrichisseur',
              eventType: { in: sa.eventTypePatterns },
            },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.agentEvent.count({
            where: {
              agentName: 'enrichisseur',
              eventType: { in: sa.eventTypePatterns },
              errorMessage: null,
            },
          }),
          this.prisma.agentEvent.count({
            where: {
              agentName: 'enrichisseur',
              eventType: { in: sa.eventTypePatterns },
              errorMessage: { not: null },
              createdAt: { gte: since24h },
            },
          }),
        ]);

        const isRunning = lastEvent
          ? Date.now() - new Date(lastEvent.createdAt).getTime() < 30 * 60 * 1000
          : false;

        const status = errorsLast24h > 0 && !isRunning ? 'error' : isRunning ? 'running' : 'idle';
        const totalAttempts = successCount + errorsLast24h;
        const successRate = totalAttempts > 0 ? Math.round((successCount / totalAttempts) * 100) : 100;

        return {
          name: sa.name,
          displayName: sa.displayName,
          status,
          lastRunAt: lastEvent?.createdAt?.toISOString() ?? null,
          leadsProduced: successCount,
          errorsLast24h,
          successRate,
        };
      }),
    );
  }

  async getScoreurMetrics() {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [distribution, avgScore, volume24h, volume7d] = await Promise.all([
      this.prisma.prospectScore.groupBy({
        by: ['segment'],
        _count: { _all: true },
        where: { isLatest: true },
      }),
      this.prisma.prospectScore.aggregate({
        _avg: { totalScore: true },
        where: { isLatest: true },
      }),
      this.prisma.prospectScore.count({
        where: { isLatest: true, calculatedAt: { gte: since24h } },
      }),
      this.prisma.prospectScore.count({
        where: { isLatest: true, calculatedAt: { gte: since7d } },
      }),
    ]);

    const distributionMap: Record<string, number> = {};
    for (const row of distribution) {
      distributionMap[row.segment ?? 'UNKNOWN'] = row._count._all;
    }

    const topProspectScores = await this.prisma.prospectScore.findMany({
      where: { isLatest: true },
      orderBy: { totalScore: 'desc' },
      take: 10,
      include: { prospect: { select: { companyName: true } } },
    });

    const topProspects = topProspectScores.map((ps) => ({
      prospectId: ps.prospectId,
      companyName: ps.prospect.companyName,
      totalScore: ps.totalScore,
      segment: ps.segment ?? 'UNKNOWN',
    }));

    return {
      distribution: distributionMap,
      avgScore: Math.round((avgScore._avg.totalScore ?? 0) * 10) / 10,
      volume24h,
      volume7d,
      topProspects,
    };
  }

  async getRedacteurMetrics() {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [messages24h, avgCost, totalCostToday, byChannel] = await Promise.all([
      this.prisma.generatedMessage.count({
        where: { createdAt: { gte: since24h } },
      }),
      this.prisma.generatedMessage.aggregate({
        _avg: { costEur: true },
      }),
      this.prisma.generatedMessage.aggregate({
        _sum: { costEur: true },
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.generatedMessage.groupBy({
        by: ['channel'],
        _count: { _all: true },
        where: { createdAt: { gte: since24h } },
      }),
    ]);

    const channelMap = Object.fromEntries(
      byChannel.map((r) => [r.channel, r._count._all]),
    );

    return {
      messagesGenerated24h: messages24h,
      avgCostEur: Math.round((avgCost._avg.costEur ?? 0) * 10000) / 10000,
      totalCostToday: Math.round((totalCostToday._sum.costEur ?? 0) * 10000) / 10000,
      byChannel: {
        email: channelMap['email'] ?? 0,
        linkedin: channelMap['linkedin'] ?? 0,
      },
    };
  }

  async getTenders(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.publicTender.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.publicTender.count(),
    ]);
    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getVeilleurReport(date: string) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [events, tenderCount] = await Promise.all([
      this.prisma.agentEvent.findMany({
        where: {
          agentName: 'veilleur',
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      this.prisma.publicTender.count({
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
      }),
    ]);

    const leadsBySource: Record<string, number> = {};
    const errorsByAgent: { agent: string; message: string; time: string }[] = [];
    const topSignals: string[] = [];

    for (const event of events) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      if (payload['source'] && typeof payload['source'] === 'string') {
        const src = payload['source'] as string;
        leadsBySource[src] = (leadsBySource[src] ?? 0) + 1;
      }
      if (event.errorMessage) {
        errorsByAgent.push({
          agent: event.agentName,
          message: event.errorMessage,
          time: event.createdAt.toISOString(),
        });
      }
      if (payload['signal'] && typeof payload['signal'] === 'string') {
        topSignals.push(payload['signal'] as string);
      }
    }

    return {
      date,
      leadsTotal: events.filter((e) => !e.errorMessage).length,
      leadsBySource,
      tenderCount,
      errorsByAgent,
      topSignals: topSignals.slice(0, 5),
    };
  }

  async getPendingActionItems() {
    return [];
  }

  async triggerAgent(name: string) {
    switch (name) {
      case 'veilleur':
        await this.veilleurQueue.add('scan-boamp', {
          source: 'boamp',
          keywords: ['digital', 'numérique', 'site web', 'application', 'marketing'],
          since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          maxResults: 20,
        });
        return { triggered: true, agent: 'veilleur', action: 'scan-boamp' };

      case 'enrichisseur': {
        const unprocessed = await this.prisma.rawLead.findMany({
          where: { processed: false },
          take: 20,
        });
        for (const lead of unprocessed) {
          await this.enrichisseurQueue.add('enrich-lead', { leadId: lead.id, source: lead.source, preScore: 0 });
        }
        return { triggered: true, agent: 'enrichisseur', action: `enrich ${unprocessed.length} leads` };
      }

      case 'scoreur': {
        const unscored = await this.prisma.prospect.findMany({
          where: { status: 'raw' },
          take: 20,
          select: { id: true },
        });
        for (const p of unscored) {
          await this.scoreurQueue.add('score-prospect', { prospectId: p.id });
        }
        return { triggered: true, agent: 'scoreur', action: `score ${unscored.length} prospects` };
      }

      case 'suiveur':
        await this.suiveurQueue.add('detect-responses', {
          since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        });
        return { triggered: true, agent: 'suiveur', action: 'detect-responses' };

      case 'nurtureur':
        await this.nurturerQueue.add('re-engagement-check', {});
        return { triggered: true, agent: 'nurtureur', action: 're-engagement-check' };

      default:
        return { triggered: false, agent: name, action: 'unknown agent' };
    }
  }

  async getSuiveurMetrics() {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [sent24h, sent7d, delivered, opened, replied, bounced, activeSequences, completedSequences] = await Promise.all([
      this.prisma.emailSend.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.emailSend.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.emailSend.count({ where: { deliveredAt: { not: null }, createdAt: { gte: weekAgo } } }),
      this.prisma.emailSend.count({ where: { openedAt: { not: null }, createdAt: { gte: weekAgo } } }),
      this.prisma.emailSend.count({ where: { repliedAt: { not: null }, createdAt: { gte: weekAgo } } }),
      this.prisma.emailSend.count({ where: { bouncedAt: { not: null }, createdAt: { gte: weekAgo } } }),
      this.prisma.prospectSequence.count({ where: { status: 'active' } }),
      this.prisma.prospectSequence.count({ where: { status: 'completed' } }),
    ]);

    return {
      emailsSent24h: sent24h,
      emailsSent7d: sent7d,
      deliveryRate: sent7d > 0 ? Math.round((delivered / sent7d) * 100) : 0,
      openRate: delivered > 0 ? Math.round((opened / delivered) * 100) : 0,
      replyRate: sent7d > 0 ? Math.round((replied / sent7d) * 100) : 0,
      bounceRate: sent7d > 0 ? Math.round((bounced / sent7d) * 100) : 0,
      activeSequences,
      completedSequences,
    };
  }

  // ═══════════════ AGENT 6 — NURTUREUR ═══════════════
  async getNurtureurMetrics(): Promise<any> {
    const [activeSequences, completedSequences, exitedSequences, engagementAvg] = await Promise.all([
      this.prisma.nurtureProspect.count({ where: { status: 'active' } }),
      this.prisma.nurtureProspect.count({ where: { status: 'completed' } }),
      this.prisma.nurtureProspect.count({ where: { status: 'exited' } }),
      this.prisma.nurtureProspect.aggregate({ _avg: { engagementScoreCurrent: true } }),
    ]);
    const total = activeSequences + completedSequences + exitedSequences;
    return {
      activeSequences,
      completedSequences,
      exitedSequences,
      totalSequences: total,
      completionRate: total > 0 ? Math.round((completedSequences / total) * 100) : 0,
      avgEngagementScore: Math.round(engagementAvg._avg?.engagementScoreCurrent ?? 0),
      byStage: await this.prisma.nurtureProspect.groupBy({
        by: ['journeyStage'],
        where: { status: 'active' },
        _count: { id: true },
      }),
    };
  }

  // ═══════════════ AGENT 7 — ANALYSTE ═══════════════
  async getAnalysteMetrics(): Promise<any> {
    const [alertes, recommendations, latestMetrics] = await Promise.all([
      this.prisma.alertes.groupBy({ by: ['severity'], _count: { id: true } }),
      this.prisma.agentEvent.count({ where: { agentName: 'analyste', eventType: 'recommendation_generated' } }),
      this.prisma.metriquesDaily.findFirst({ orderBy: { dateSnapshot: 'desc' } }),
    ]);
    return {
      alertsBySeverity: Object.fromEntries(alertes.map((a: { severity: string; _count: { id: number } }) => [a.severity, a._count.id])),
      totalAlerts: alertes.reduce((sum: number, a: { _count: { id: number } }) => sum + a._count.id, 0),
      recommendationsGenerated: recommendations,
      latestMetrics: latestMetrics ? {
        leadsDetected: latestMetrics.veilleurLeadsBruts,
        conversionRate: latestMetrics.enrichisseurTauxEnrichissement,
        costPerLead: latestMetrics.veilleurCoutApiEur,
      } : null,
    };
  }

  // ═══════════════ AGENT 8 — DEALMAKER ═══════════════
  async getDealmakerMetrics(): Promise<any> {
    const [dealsByStage, totalDeals, wonDeals, lostDeals, avgValue] = await Promise.all([
      this.prisma.dealCrm.groupBy({ by: ['stage'], _count: { id: true }, _sum: { amountEur: true } }),
      this.prisma.dealCrm.count(),
      this.prisma.dealCrm.count({ where: { stage: 'GAGNE' } }),
      this.prisma.dealCrm.count({ where: { stage: 'PERDU' } }),
      this.prisma.dealCrm.aggregate({ _avg: { amountEur: true } }),
    ]);
    return {
      totalDeals,
      wonDeals,
      lostDeals,
      winRate: totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0,
      avgDealValue: Math.round(avgValue._avg?.amountEur ?? 0),
      pipeline: dealsByStage.map(d => ({
        stage: d.stage,
        count: d._count.id,
        value: d._sum?.amountEur ?? 0,
      })),
    };
  }

  // ═══════════════ AGENT 9 — APPELS D'OFFRES ═══════════════
  async getAppelsOffresMetrics(): Promise<any> {
    const [tendersByStatus, totalTenders, wonTenders] = await Promise.all([
      this.prisma.publicTender.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.publicTender.count(),
      this.prisma.publicTender.count({ where: { status: 'WON' } }),
    ]);
    return {
      totalTenders,
      wonTenders,
      winRate: totalTenders > 0 ? Math.round((wonTenders / totalTenders) * 100) : 0,
      byStatus: Object.fromEntries(tendersByStatus.map(t => [t.status, t._count.id])),
      activePipeline: tendersByStatus.filter(t => !['WON', 'LOST', 'IGNORED'].includes(t.status)).reduce((sum, t) => sum + t._count.id, 0),
    };
  }

  // ═══════════════ AGENT 10 — CSM ═══════════════
  async getCsmMetrics(): Promise<any> {
    const [customers, healthScores, churnSignals, upsellOpps, referralPrograms, reviews, onboardingRisks] = await Promise.all([
      this.prisma.customer.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.customerHealthScore.findMany({ where: { isLatest: true }, select: { healthScore: true, healthLabel: true } }),
      this.prisma.churnSignal.count({ where: { resolvedAt: null } }),
      this.prisma.upsellOpportunity.groupBy({ by: ['status'], _count: { id: true }, _sum: { estimatedValue: true } }),
      this.prisma.referralProgram.count({ where: { status: 'active' } }),
      this.prisma.reviewRequest.count({ where: { reviewReceived: true } }),
      this.prisma.onboardingRisk.count({ where: { resolvedAt: null, severity: { in: ['high', 'critical'] } } }),
    ]);

    const healthDist = { green: 0, yellow: 0, orange: 0, dark_orange: 0, red: 0 };
    let totalScore = 0;
    for (const hs of healthScores) {
      totalScore += hs.healthScore;
      if (hs.healthLabel && hs.healthLabel in healthDist) healthDist[hs.healthLabel as keyof typeof healthDist]++;
    }

    return {
      totalCustomers: customers.reduce((sum, c) => sum + c._count.id, 0),
      customersByStatus: Object.fromEntries(customers.map(c => [c.status, c._count.id])),
      avgHealthScore: healthScores.length > 0 ? Math.round(totalScore / healthScores.length) : 0,
      healthDistribution: healthDist,
      activeChurnSignals: churnSignals,
      upsellPipeline: upsellOpps.map(u => ({ status: u.status, count: u._count.id, value: u._sum?.estimatedValue ?? 0 })),
      activeAmbassadors: referralPrograms,
      reviewsCollected: reviews,
      atRiskOnboardings: onboardingRisks,
    };
  }

  async getAgentGraph() {
    const agentStatuses = await this.getAgentStatuses();
    const statusMap = new Map(agentStatuses.map((a) => [a.name, a.status as 'idle' | 'running' | 'error' | 'paused']));

    const nodes = [
      { id: 'veilleur', name: 'veilleur' as const, position: { x: 100, y: 50 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'enrichisseur', name: 'enrichisseur' as const, position: { x: 300, y: 50 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'scoreur', name: 'scoreur' as const, position: { x: 500, y: 50 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'redacteur', name: 'redacteur' as const, position: { x: 700, y: 50 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'suiveur', name: 'suiveur' as const, position: { x: 700, y: 200 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'nurtureur', name: 'nurtureur' as const, position: { x: 500, y: 200 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'analyste', name: 'analyste' as const, position: { x: 300, y: 200 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'dealmaker', name: 'dealmaker' as const, position: { x: 100, y: 200 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'appels-offres', name: 'appels-offres' as const, position: { x: 100, y: 350 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
      { id: 'csm', name: 'csm' as const, position: { x: 300, y: 350 }, metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 } },
    ].map((n) => ({ ...n, status: statusMap.get(n.name) ?? ('idle' as const) }));

    const edges = [
      { source: 'veilleur' as const, target: 'enrichisseur' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'enrichisseur' as const, target: 'scoreur' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'scoreur' as const, target: 'redacteur' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'redacteur' as const, target: 'suiveur' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'suiveur' as const, target: 'nurtureur' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'suiveur' as const, target: 'dealmaker' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'dealmaker' as const, target: 'csm' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'analyste' as const, target: 'dealmaker' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
      { source: 'veilleur' as const, target: 'appels-offres' as const, messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
    ];

    return { nodes, edges };
  }
}
