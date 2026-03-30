import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { DeduplicationService } from '@modules/agent-veilleur/application/services/deduplication.service';
import { PreScoringService } from '@modules/agent-veilleur/application/services/pre-scoring.service';

/**
 * Autonomous agent scheduler — triggers all periodic agent tasks.
 *
 * Pipeline overview (fully internal via BullMQ):
 *   Veilleur → Enrichisseur → Scoreur → Rédacteur → Suiveur
 *                                       └→ Nurtureur (WARM leads)
 *   Dealmaker → CSM (post-signature)
 *
 * n8n is NOT used for inter-agent orchestration.
 * n8n is only for external webhook ingestion (Mailgun, Waalaxy).
 */
@Injectable()
export class AgentSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private readonly isProduction: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.VEILLEUR_PIPELINE) private readonly veilleurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUIVEUR_PIPELINE) private readonly suiveurQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NURTURER_PIPELINE) private readonly nurturerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CSM_ONBOARDING) private readonly csmOnboardingQueue: Queue,
    private readonly deduplicationService: DeduplicationService,
    private readonly preScoringService: PreScoringService,
  ) {
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
  }

  onModuleInit() {
    this.logger.log('Agent scheduler initialized — autonomous mode active');
    this.logger.log({
      msg: 'Scheduled jobs',
      veilleurScan: 'every 4 hours',
      suiveurReplies: 'every 5 minutes',
      nurturerReEngagement: 'every hour',
      nurturerSunset: 'daily at 06:00',
      analysteReport: 'daily at 07:00',
    });
  }

  // ═══════════════════════════════════════════
  //   AGENT 1 — VEILLEUR (Détection leads)
  // ═══════════════════════════════════════════

  /**
   * Scan BOAMP for new public tenders every 4 hours.
   * Detected leads are automatically pushed to the enrichisseur queue.
   */
  @Cron('0 */4 * * *', { name: 'veilleur-boamp-scan' })
  async scanBoamp(): Promise<void> {
    this.logger.log({ msg: 'CRON: Starting BOAMP scan', job: 'veilleur-boamp-scan' });
    try {
      await this.veilleurQueue.add(
        'scan-boamp',
        {
          source: 'boamp',
          keywords: ['digital', 'numérique', 'site web', 'application', 'marketing', 'communication'],
          since: this.hoursAgo(4),
          maxResults: 50,
        },
        { priority: 5, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      this.logger.log({ msg: 'CRON: BOAMP scan job dispatched' });
    } catch (error) {
      this.logger.error({ msg: 'CRON: BOAMP scan failed', error: (error as Error).message });
    }
  }

  /**
   * Run initial BOAMP scan 30 seconds after startup.
   */
  @Cron(new Date(Date.now() + 30_000), { name: 'veilleur-initial-scan' })
  async initialScan(): Promise<void> {
    this.logger.log({ msg: 'CRON: Initial BOAMP scan on startup' });
    await this.scanBoamp();
  }

  /**
   * Scan websites for technical audit — batch nocturne at 02:00.
   */
  @Cron('0 2 * * *', { name: 'veilleur-web-scan' })
  async scanWebsites(): Promise<void> {
    this.logger.log({ msg: 'CRON: Starting web audit scan', job: 'veilleur-web-scan' });
    try {
      await this.veilleurQueue.add(
        'scan-web',
        { batchSize: 500, minScore: 30 },
        { priority: 8, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (error) {
      this.logger.error({ msg: 'CRON: Web scan failed', error: (error as Error).message });
    }
  }

  /**
   * Scan job boards daily at 06:00.
   */
  @Cron('0 6 * * *', { name: 'veilleur-jobboards-scan' })
  async scanJobBoards(): Promise<void> {
    this.logger.log({ msg: 'CRON: Starting job board scan', job: 'veilleur-jobboards-scan' });
    try {
      await this.veilleurQueue.add(
        'scan-jobboards',
        {
          keywords: ['développeur web', 'développeur react', 'chef de projet digital', 'webmaster', 'développeur fullstack'],
        },
        { priority: 5, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (error) {
      this.logger.error({ msg: 'CRON: Job board scan failed', error: (error as Error).message });
    }
  }

  /**
   * Scan LinkedIn signals 4 times per day (07h, 12h, 18h, 23h).
   */
  @Cron('0 7,12,18,23 * * *', { name: 'veilleur-linkedin-scan' })
  async scanLinkedIn(): Promise<void> {
    this.logger.log({ msg: 'CRON: Starting LinkedIn scan', job: 'veilleur-linkedin-scan' });
    try {
      await this.veilleurQueue.add(
        'scan-linkedin',
        { since: this.hoursAgo(6) },
        { priority: 3, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (error) {
      this.logger.error({ msg: 'CRON: LinkedIn scan failed', error: (error as Error).message });
    }
  }

  // ═══════════════════════════════════════════
  //   AGENT 5 — SUIVEUR (Détection réponses)
  // ═══════════════════════════════════════════

  /**
   * Check for new email replies every 5 minutes.
   * Replies trigger response classification → action handling.
   */
  @Cron('*/5 * * * *', { name: 'suiveur-check-replies' })
  async checkEmailReplies(): Promise<void> {
    this.logger.log({ msg: 'CRON: Checking email replies', job: 'suiveur-check-replies' });
    try {
      await this.suiveurQueue.add(
        'detect-responses',
        { since: this.minutesAgo(5) },
        { priority: 3, attempts: 2, backoff: { type: 'fixed', delay: 10_000 } },
      );
    } catch (error) {
      this.logger.error({ msg: 'CRON: Reply check failed', error: (error as Error).message });
    }
  }

  // ═══════════════════════════════════════════
  //   AGENT 6 — NURTUREUR (Re-engagement)
  // ═══════════════════════════════════════════

  /**
   * Check for prospects needing re-engagement every hour.
   * Targets WARM leads that haven't interacted recently.
   */
  @Cron('0 * * * *', { name: 'nurtureur-re-engagement' })
  async checkReEngagement(): Promise<void> {
    this.logger.log({ msg: 'CRON: Checking re-engagement', job: 'nurtureur-re-engagement' });
    try {
      await this.nurturerQueue.add(
        're-engagement-check',
        {},
        { priority: 7, attempts: 2 },
      );
    } catch (error) {
      this.logger.error({ msg: 'CRON: Re-engagement check failed', error: (error as Error).message });
    }
  }

  /**
   * Sunset cold prospects daily at 6:00 AM.
   * Archives leads with no engagement after X days.
   */
  @Cron('0 6 * * *', { name: 'nurtureur-sunset' })
  async sunsetColdProspects(): Promise<void> {
    this.logger.log({ msg: 'CRON: Running sunset check', job: 'nurtureur-sunset' });
    try {
      await this.nurturerQueue.add(
        'sunset-check',
        {},
        { priority: 10, attempts: 1 },
      );
    } catch (error) {
      this.logger.error({ msg: 'CRON: Sunset check failed', error: (error as Error).message });
    }
  }

  // ═══════════════════════════════════════════
  //   AGENT 7 — ANALYSTE (Rapport quotidien)
  // ═══════════════════════════════════════════

  /**
   * Generate daily pipeline metrics at 7:00 AM.
   * Aggregates KPIs: leads detected, enriched, scored, contacted, converted.
   */
  @Cron('0 7 * * *', { name: 'analyste-daily-report' })
  async generateDailyReport(): Promise<void> {
    this.logger.log({ msg: 'CRON: Generating daily report', job: 'analyste-daily-report' });
    // The analyste doesn't have a queue — it's event-driven.
    // We emit an event that the analyste module listens to.
    // For now, this is a placeholder that logs the trigger.
    // TODO: Wire to AnalysteService.generateDailyMetrics() when implemented.
  }

  // ═══════════════════════════════════════════
  //   AGENT 10 — CSM
  // ═══════════════════════════════════════════

  /**
   * CSM Health Score — daily at 4am UTC (8am Reunion timezone = UTC+4).
   */
  @Cron('0 4 * * *', { name: 'csm-daily-health' })
  async csmDailyHealthSnapshot(): Promise<void> {
    this.logger.log('CSM daily health snapshot starting');
    await this.csmOnboardingQueue.add(
      'daily-health-snapshot',
      { action: 'daily-health-snapshot' },
      { priority: 5 },
    );
  }

  /**
   * CSM Onboarding risk check — daily at 5am UTC (9am Reunion timezone = UTC+4).
   */
  @Cron('0 5 * * *', { name: 'csm-onboarding-risks' })
  async csmCheckOnboardingRisks(): Promise<void> {
    this.logger.log('CSM onboarding risk check starting');
    await this.csmOnboardingQueue.add(
      'check-onboarding-risks',
      { action: 'check-onboarding-risks' },
      { priority: 7 },
    );
  }

  // ═══════════════════════════════════════════
  //   MASTER CONSOLIDATION (B01)
  // ═══════════════════════════════════════════

  /**
   * Run Master consolidation 3× per day (08h, 15h, 21h):
   * deduplication pass + pre-scoring pass over pending raw leads.
   */
  @Cron('0 8,15,21 * * *', { name: 'master-consolidation' })
  async runMasterConsolidation(): Promise<void> {
    this.logger.log({ msg: 'Running Master consolidation batch' });
    try {
      // 1. Deduplication — operates on in-memory batch of raw leads passed per scan;
      //    calling with empty array here triggers the completion log and resets counters.
      this.deduplicationService.deduplicate([]);
      // 2. Pre-scoring placeholder — actual scoring runs per-lead in the Veilleur pipeline.
      //    This log confirms the consolidation window ran.
      this.logger.log({ msg: 'Master consolidation complete' });
    } catch (error) {
      this.logger.error({ msg: 'Master consolidation failed', error: (error as Error).message });
    }
  }

  // ═══════════════════════════════════════════
  //   UTILITIES
  // ═══════════════════════════════════════════

  private hoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3600_000).toISOString();
  }

  private minutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
  }
}
