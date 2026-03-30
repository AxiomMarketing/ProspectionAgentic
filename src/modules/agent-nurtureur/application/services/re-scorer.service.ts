import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

export type EngagementAction =
  | 'email_opened'
  | 'email_clicked'
  | 'content_downloaded'
  | 'pricing_page'
  | 'reply'
  | 'contact_spontaneous'
  | 'site_visit';

const ENGAGEMENT_POINTS: Record<EngagementAction, number> = {
  email_opened: 2,
  email_clicked: 5,
  content_downloaded: 8,
  pricing_page: 10,
  reply: 15,
  contact_spontaneous: 25,
  site_visit: 3,
};

@Injectable()
export class ReScorerService implements OnModuleDestroy {
  private readonly logger = new Logger(ReScorerService.name);
  private readonly rescoreThreshold: number;
  private readonly redis: InstanceType<typeof Redis>;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCOREUR_PIPELINE) private readonly scoreurQueue: Queue,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.rescoreThreshold = this.configService.get<number>('NURTUREUR_RESCORE_THRESHOLD', 75);
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis error in ReScorerService', error: err.message });
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

  async trackEngagement(prospectId: string, action: EngagementAction): Promise<void> {
    const points = ENGAGEMENT_POINTS[action];

    const nurture = await this.prisma.nurtureProspect.update({
      where: { prospectId },
      data: {
        engagementScoreCurrent: { increment: points },
        lastInteractionAt: new Date(),
        lastScoreUpdate: new Date(),
        ...(action === 'email_opened' ? { consecutiveUnopened: 0 } : {}),
      },
    });

    await this.prisma.nurtureInteraction.create({
      data: {
        nurtureId: nurture.id,
        prospectId,
        interactionType: action,
        channel: 'email',
        scoreDelta: points,
        scoreAfter: nurture.engagementScoreCurrent,
      },
    });

    await this.checkHotHandoff(prospectId);
    await this.checkImmediateTriggers(prospectId);
  }

  async checkHotHandoff(prospectId: string): Promise<boolean> {
    const nurture = await this.prisma.nurtureProspect.findUnique({
      where: { prospectId },
    });

    if (!nurture || nurture.engagementScoreCurrent < this.rescoreThreshold) {
      return false;
    }

    const entryDate = nurture.entryDate ?? nurture.createdAt;
    const daysInNurture = Math.floor(
      (Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const nurture_data = {
      engagementScoreInitial: nurture.engagementScoreInitial,
      engagementScoreCurrent: nurture.engagementScoreCurrent,
      emailsSent: nurture.emailsNurtureSent,
      emailsOpened: nurture.emailsOpened,
      emailsClicked: nurture.emailsClicked,
      lastInteractionAt: nurture.lastInteractionAt,
      journeyStage: nurture.journeyStage,
      sequenceType: nurture.sequenceType,
      daysInNurture,
    };

    await this.scoreurQueue.add('score-prospect', {
      prospectId,
      trigger: 'nurture_engagement',
      nurture_data,
    });

    await this.prisma.nurtureProspect.update({
      where: { prospectId },
      data: { status: 'paused' },
    });

    this.eventEmitter.emit('nurture.rescore.triggered', { prospectId, nurture_data });

    this.logger.log({ msg: 'HOT handoff triggered', prospectId, score: nurture.engagementScoreCurrent });

    return true;
  }

  @Cron('0 3 * * 0')
  async weeklyEngagementDecay(): Promise<void> {
    if (!await this.acquireCronLock('weekly-engagement-decay', 300)) return;
    const result = await this.prisma.$executeRaw`
      UPDATE nurture_prospects
      SET engagement_score_current = GREATEST(0, engagement_score_current * 0.95)
      WHERE status = 'active'
        AND engagement_score_current > 0
    `;

    this.logger.log({ msg: 'Weekly engagement decay applied', affectedRows: result });
  }

  @Cron('0 4 1 * *')
  async monthlyRescore(): Promise<void> {
    if (!await this.acquireCronLock('monthly-rescore', 600)) return;
    const prospects = await this.prisma.nurtureProspect.findMany({
      where: {
        status: 'active',
        engagementScoreCurrent: { gt: 0 },
      },
      select: { prospectId: true },
    });

    this.logger.log({ msg: 'Monthly rescore batch start', count: prospects.length });

    const batchSize = 50;
    for (let i = 0; i < prospects.length; i += batchSize) {
      const batch = prospects.slice(i, i + batchSize);
      await Promise.all(batch.map((p) => this.checkHotHandoff(p.prospectId)));
    }

    this.logger.log({ msg: 'Monthly rescore batch complete', count: prospects.length });
  }

  async checkImmediateTriggers(prospectId: string): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentCount = await this.prisma.nurtureInteraction.count({
      where: {
        prospectId,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (recentCount >= 3) {
      await this.checkHotHandoff(prospectId);
    }
  }
}
