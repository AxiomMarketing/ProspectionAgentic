import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { IHealthScoreRepository } from '../../domain/repositories/i-health-score.repository';
import { HealthScore, HealthScoreProps } from '../../domain/entities/health-score.entity';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

export interface ChurnSignalData {
  signalType: string;
  severity: string;
  description: string;
}

export type HealthScoreResult = HealthScoreProps | null;

@Injectable()
export class SatisfactionService {
  private readonly logger = new Logger(SatisfactionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerRepository: ICustomerRepository,
    private readonly healthScoreRepository: IHealthScoreRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.NURTURER_CHURNED_CLIENT) private readonly nurturerChurnQueue: Queue,
  ) {}

  async calculateHealthScore(customerId: string): Promise<HealthScoreResult> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    // Skip if customer is in onboarding < 30 days (AP6)
    const daysSinceStart = customer.contractStartDate
      ? Math.floor((Date.now() - customer.contractStartDate.getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    if (customer.status === 'onboarding' && daysSinceStart < 30) {
      return null; // Insufficient data
    }

    const engagement = await this.calculateEngagement(customerId);
    const satisfaction = await this.calculateSatisfaction(customerId);
    const growth = await this.calculateGrowth(customerId);

    const healthScore = Math.round(engagement * 0.4 + satisfaction * 0.3 + growth * 0.3);
    const healthLabel = this.getHealthLabel(healthScore);

    // Supercede old score, create new
    const existing = await this.healthScoreRepository.findLatestByCustomerId(customerId);
    if (existing) {
      await this.healthScoreRepository.save(existing.supercede());
    }
    const score = HealthScore.create({
      customerId,
      healthScore,
      healthLabel,
      usageScore: engagement,
      supportScore: satisfaction,
      financialScore: growth,
      engagementScore: engagement,
      npsScore: undefined,
      signals: {},
    });
    await this.healthScoreRepository.save(score);

    this.eventEmitter.emit('health.calculated', { customerId, healthScore, healthLabel });

    // Trigger actions based on label
    if (healthLabel === 'green') this.eventEmitter.emit('health.green_promoter', { customerId });
    if (healthLabel === 'red') {
      this.eventEmitter.emit('health.churn_detected', { customerId, healthScore });
      // Dispatch to Agent 6 Nurtureur for churned client re-engagement
      const fullCustomer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        include: { deals: { orderBy: { updatedAt: 'desc' }, take: 1 } },
      });
      if (fullCustomer?.primaryContactId) {
        await this.nurturerChurnQueue.add('churned-client', {
          type: 'churned_client',
          client_id: customerId,
          deal_id: fullCustomer.deals[0]?.id,
          prospect_id: fullCustomer.primaryContactId,
          churn_reason: 'silence',
          churn_detail: `Health score ${healthScore} (red)`,
          last_health_score: healthScore,
          metadata: { agent: 'agent_10_csm', created_at: new Date().toISOString(), version: '1.0' },
        });
      }
    }
    if (['orange', 'dark_orange'].includes(healthLabel))
      this.eventEmitter.emit('health.at_risk', { customerId, healthScore, healthLabel });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'health_score_calculated',
      payload: { customerId, healthScore, healthLabel },
    });

    return score.toPlainObject();
  }

  async detectChurnSignals(customerId: string): Promise<ChurnSignalData[]> {
    const signals: ChurnSignalData[] = [];
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) return signals;

    const silenceDays = this.configService.get<number>('csm.churnSilenceDays', 60);
    const criticalSilenceDays = this.configService.get<number>('csm.churnCriticalSilenceDays', 120);

    // 1. Silence radio
    const lastEvent = await this.prisma.agentEvent.findFirst({
      where: { payload: { path: ['customerId'], equals: customerId } },
      orderBy: { createdAt: 'desc' },
    });
    if (lastEvent) {
      const daysSince = Math.floor(
        (Date.now() - lastEvent.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysSince >= silenceDays) {
        signals.push({
          signalType: 'silence',
          severity: daysSince >= criticalSilenceDays ? 'critical' : 'high',
          description: `No activity for ${daysSince} days`,
        });
      }
    }

    // 2. NPS detractor
    const lastNps = await this.prisma.npsSurvey.findFirst({
      where: { customerId, type: 'nps', status: 'responded' },
      orderBy: { respondedAt: 'desc' },
    });
    if (lastNps && lastNps.score !== null && lastNps.score < 6) {
      signals.push({
        signalType: 'nps_detractor',
        severity: 'medium',
        description: `NPS score ${lastNps.score}/10`,
      });
    }

    // 3. Health Score drop > 20pts
    const healthScores = await this.prisma.customerHealthScore.findMany({
      where: { customerId },
      orderBy: { calculatedAt: 'desc' },
      take: 2,
    });
    if (healthScores.length === 2) {
      const drop = (healthScores[1].healthScore as number) - (healthScores[0].healthScore as number);
      if (drop > 20) {
        signals.push({
          signalType: 'health_drop',
          severity: 'high',
          description: `Health dropped ${drop} points`,
        });
      }
    }

    // Persist signals
    for (const signal of signals) {
      await this.prisma.churnSignal.create({
        data: { customerId, ...signal, detectedAt: new Date() },
      });
    }

    return signals;
  }

  async checkAllCustomersHealth(): Promise<void> {
    const activeCustomers = await this.prisma.customer.findMany({
      where: {
        status: { in: ['active'] }, // Skip 'onboarding' — handled by onboarding service
      },
    });

    // Batch: 50 at a time, 5 concurrent
    const batchSize = 50;
    for (let i = 0; i < activeCustomers.length; i += batchSize) {
      const batch = activeCustomers.slice(i, i + batchSize);
      const promises = batch.map((c) =>
        this.calculateHealthScore(c.id).catch((err: Error) => {
          this.logger.error({ msg: 'Health score failed', customerId: c.id, error: err.message });
        }),
      );
      await Promise.all(promises);
    }

    // Persist daily snapshot to CsmMetricsDaily
    const healthScores = await this.prisma.customerHealthScore.findMany({
      where: { isLatest: true },
    });
    const distribution = { vert: 0, jaune: 0, orange: 0, orange_fonce: 0, rouge: 0 };
    for (const hs of healthScores) {
      if (hs.healthLabel === 'green') distribution.vert++;
      else if (hs.healthLabel === 'yellow') distribution.jaune++;
      else if (hs.healthLabel === 'orange') distribution.orange++;
      else if (hs.healthLabel === 'dark_orange') distribution.orange_fonce++;
      else distribution.rouge++;
    }
    const avg =
      healthScores.length > 0
        ? healthScores.reduce((s, h) => s + (h.healthScore as number), 0) / healthScores.length
        : 0;

    await this.prisma.csmMetricsDaily.upsert({
      where: { date: new Date(new Date().toISOString().split('T')[0]) },
      create: {
        date: new Date(new Date().toISOString().split('T')[0]),
        snapshot: { health_distribution: distribution } as any,
        totalClients: activeCustomers.length,
        avgHealthScore: Math.round(avg * 100) / 100,
        churnRate: 0,
        nrr: 100,
      },
      update: {
        snapshot: { health_distribution: distribution } as any,
        totalClients: activeCustomers.length,
        avgHealthScore: Math.round(avg * 100) / 100,
      },
    });

    this.logger.log({
      msg: 'Daily health snapshot complete',
      totalClients: activeCustomers.length,
      avgScore: avg,
    });
  }

  private async calculateEngagement(customerId: string): Promise<number> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { primaryContactId: true },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Contact frequency (events count) — 20% of engagement
    const eventCount = await this.prisma.agentEvent.count({
      where: {
        OR: [
          { prospectId: customer?.primaryContactId ?? undefined },
          { payload: { path: ['customerId'], equals: customerId } },
        ],
        createdAt: { gte: thirtyDaysAgo },
      },
    });
    const contactScore = Math.min(100, eventCount * 15);

    // 2. Email reactivity — 25% (touchpoint opens)
    const touchpoints = customer?.primaryContactId
      ? await this.prisma.touchpoint.findMany({
          where: {
            prospectId: customer.primaryContactId,
            channel: 'email',
            createdAt: { gte: thirtyDaysAgo },
          },
        })
      : [];
    const emailsSent = touchpoints.length || 1;
    const emailsOpened = touchpoints.filter(
      (t) => t.status === 'opened' || t.status === 'clicked' || t.status === 'replied',
    ).length;
    const emailReactivity = Math.round((emailsOpened / emailsSent) * 100);

    // Simplified composite: 65% contact proxy + 25% email reactivity + 10% contact proxy
    return Math.round(contactScore * 0.65 + emailReactivity * 0.25 + contactScore * 0.1);
  }

  private async calculateSatisfaction(customerId: string): Promise<number> {
    // 1. Last NPS (50%)
    const lastNps = await this.prisma.npsSurvey.findFirst({
      where: { customerId, type: 'nps', status: 'responded' },
      orderBy: { respondedAt: 'desc' },
    });
    const npsNormalized = lastNps?.score != null ? (lastNps.score / 10) * 100 : 50;

    // 2. CSAT average (30%)
    const csatSurveys = await this.prisma.npsSurvey.findMany({
      where: { customerId, type: 'csat', status: 'responded' },
      orderBy: { respondedAt: 'desc' },
      take: 5,
    });
    const csatAvg =
      csatSurveys.length > 0
        ? (csatSurveys.reduce((sum, s) => sum + (s.score ?? 0), 0) / csatSurveys.length) * 20
        : 50;

    // 3. Critical tickets penalty (10%)
    const openTickets = await this.prisma.churnSignal.count({
      where: { customerId, signalType: 'support_spike', resolvedAt: null },
    });
    const ticketPenalty = Math.max(0, 100 - openTickets * 10);

    // 4. Sentiment (10%)
    const customerRecord = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { primaryContactId: true },
    });
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    let sentimentScore = 50;
    if (customerRecord?.primaryContactId) {
      const classifications = await this.prisma.replyClassification.findMany({
        where: {
          prospectId: customerRecord.primaryContactId,
          createdAt: { gte: ninetyDaysAgo },
        },
      });
      for (const c of classifications) {
        if (c.sentiment === 'positive') sentimentScore += 15;
        else if (c.sentiment === 'neutral') sentimentScore += 3;
        else if (c.sentiment === 'negative') sentimentScore -= 10;
      }
      sentimentScore = Math.max(0, Math.min(100, sentimentScore));
    }

    return Math.round(
      npsNormalized * 0.5 + csatAvg * 0.3 + ticketPenalty * 0.1 + sentimentScore * 0.1,
    );
  }

  private async calculateGrowth(customerId: string): Promise<number> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) return 0;

    // MRR-based scoring
    const mrrScore = customer.mrrEur > 0 ? Math.min(100, (customer.mrrEur / 50) * 100) : 30;

    // Upsell opportunity score
    const upsellOpp = await this.prisma.upsellOpportunity.findFirst({
      where: { customerId, status: { in: ['detected', 'proposed'] } },
      orderBy: { upsellScore: 'desc' },
    });
    const upsellScore = upsellOpp?.upsellScore ?? 0;

    return Math.round(mrrScore * 0.7 + upsellScore * 0.3);
  }

  private getHealthLabel(score: number): string {
    const config = this.configService.get<Record<string, number>>('csm');
    if (score >= (config?.healthScoreGreenThreshold ?? 80)) return 'green';
    if (score >= (config?.healthScoreYellowThreshold ?? 60)) return 'yellow';
    if (score >= (config?.healthScoreOrangeThreshold ?? 50)) return 'orange';
    if (score >= (config?.healthScoreDarkOrangeThreshold ?? 30)) return 'dark_orange';
    return 'red';
  }
}
