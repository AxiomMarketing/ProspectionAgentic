import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AlertSeverity } from '@prisma/client';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

interface MetricConfig {
  name: string;
  label: string;
  warningLow?: number;
  criticalLow?: number;
  warningHigh?: number;
  criticalHigh?: number;
  fixedCriticalLow?: number;
  fixedCriticalHigh?: number;
  weekdayOnly?: boolean;
}

interface Anomaly {
  metrique: string;
  valeurActuelle: number;
  moyenne7j: number;
  ecartType: number;
  zScore: number;
  seuilType: 'WARNING' | 'CRITICAL';
  message: string;
}

const METRICS_TO_MONITOR: MetricConfig[] = [
  { name: 'suiveurReplyRate', label: 'Taux de réponse', warningLow: 3, criticalLow: 2, warningHigh: 9, criticalHigh: 11, fixedCriticalLow: 1 },
  { name: 'suiveurBounceRate', label: 'Taux de bounce', warningHigh: 3, criticalHigh: 5, fixedCriticalHigh: 5 },
  { name: 'veilleurLeadsBruts', label: 'Leads détectés', warningLow: 15, criticalLow: 5, fixedCriticalLow: 0, weekdayOnly: true },
  { name: 'suiveurEmailsEnvoyes', label: 'Emails envoyés', warningLow: 5, criticalLow: 0, fixedCriticalLow: 0, weekdayOnly: true },
  { name: 'enrichisseurTauxEnrichissement', label: 'Taux enrichissement', warningLow: 60, criticalLow: 40 },
  { name: 'suiveurSlaBreaches', label: 'SLA breaches', warningHigh: 3, criticalHigh: 5, fixedCriticalHigh: 10 },
  { name: 'scoreurPctHot', label: 'Distribution HOT', warningLow: 3, criticalLow: 1, warningHigh: 25, criticalHigh: 40 },
  { name: 'nurtureurEngagementScoreMoyen', label: 'Nurture engagement', warningLow: 10, criticalLow: 5 },
];

@Injectable()
export class AnomalyDetectorService implements OnModuleDestroy {
  private readonly logger = new Logger(AnomalyDetectorService.name);
  private readonly redis: InstanceType<typeof Redis>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis connection error in AnomalyDetector', error: err.message });
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

  @Cron('45 21 * * *', { name: 'daily-anomaly-check' })
  async detectDailyAnomalies(): Promise<void> {
    if (!await this.acquireCronLock('daily-anomaly-check', 300)) return;
    await this.detectAnomalies();
  }

  @Cron('0 * * * *', { name: 'hourly-anomaly-check' })
  async detectHourlyAnomalies(): Promise<void> {
    if (!await this.acquireCronLock('hourly-anomaly-check', 60)) return;
    await this.detectAnomalies();
  }

  async detectAnomalies(date?: string): Promise<Anomaly[]> {
    const snapshotDate = date || new Date().toISOString().split('T')[0];
    this.logger.log({ msg: 'Running anomaly detection', date: snapshotDate });

    const targetDate = new Date(snapshotDate);
    const eightDaysAgo = new Date(targetDate);
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 7);

    const records = await this.prisma.metriquesDaily.findMany({
      where: { dateSnapshot: { gte: eightDaysAgo, lte: targetDate } },
      orderBy: { dateSnapshot: 'desc' },
    });

    if (records.length === 0) {
      this.logger.log({ msg: 'No data for anomaly detection', date: snapshotDate });
      return [];
    }

    const todayRecord = records[0];
    const historyRecords = records.slice(1);

    const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;

    const anomalies: Anomaly[] = [];

    for (const config of METRICS_TO_MONITOR) {
      if (config.weekdayOnly && isWeekend) {
        continue;
      }

      const currentValue = (todayRecord as Record<string, unknown>)[config.name] as number ?? 0;
      const history = historyRecords.map(
        (r) => ((r as Record<string, unknown>)[config.name] as number) ?? 0,
      );

      const anomaly = this.evaluateMetric(config, currentValue, history);
      if (anomaly) {
        anomalies.push(anomaly);
      }
    }

    if (anomalies.length > 0) {
      await this.persistAnomalies(anomalies);
      await this.sendSlackAlert(anomalies, snapshotDate);
    }

    this.logger.log({ msg: 'Anomaly detection complete', date: snapshotDate, count: anomalies.length });
    return anomalies;
  }

  private evaluateMetric(
    config: MetricConfig,
    currentValue: number,
    history: number[],
  ): Anomaly | null {
    const zScore = this.calculateZScore(currentValue, history);

    // Fixed thresholds — always apply regardless of history size
    if (config.fixedCriticalLow !== undefined && currentValue <= config.fixedCriticalLow) {
      return this.buildAnomaly(config, currentValue, history, zScore, 'CRITICAL', `${config.label} est à ${currentValue} (seuil critique absolu: ${config.fixedCriticalLow})`);
    }
    if (config.fixedCriticalHigh !== undefined && currentValue >= config.fixedCriticalHigh) {
      return this.buildAnomaly(config, currentValue, history, zScore, 'CRITICAL', `${config.label} est à ${currentValue} (seuil critique absolu: ${config.fixedCriticalHigh})`);
    }

    // Absolute thresholds (used when insufficient history)
    if (history.length < 7) {
      if (config.criticalLow !== undefined && currentValue <= config.criticalLow) {
        return this.buildAnomaly(config, currentValue, history, zScore, 'CRITICAL', `${config.label} est à ${currentValue} (seuil critique: ${config.criticalLow})`);
      }
      if (config.criticalHigh !== undefined && currentValue >= config.criticalHigh) {
        return this.buildAnomaly(config, currentValue, history, zScore, 'CRITICAL', `${config.label} est à ${currentValue} (seuil critique: ${config.criticalHigh})`);
      }
      if (config.warningLow !== undefined && currentValue <= config.warningLow) {
        return this.buildAnomaly(config, currentValue, history, zScore, 'WARNING', `${config.label} est à ${currentValue} (seuil warning: ${config.warningLow})`);
      }
      if (config.warningHigh !== undefined && currentValue >= config.warningHigh) {
        return this.buildAnomaly(config, currentValue, history, zScore, 'WARNING', `${config.label} est à ${currentValue} (seuil warning: ${config.warningHigh})`);
      }
      return null;
    }

    // Z-score based detection (with sufficient history)
    if (Math.abs(zScore) >= 3) {
      const seuilType = Math.abs(zScore) >= 4 ? 'CRITICAL' : 'WARNING';
      const direction = zScore < 0 ? 'anormalement bas' : 'anormalement haut';
      return this.buildAnomaly(config, currentValue, history, zScore, seuilType, `${config.label} est ${direction} (z-score: ${zScore.toFixed(2)})`);
    }

    // Percentage thresholds with history
    if (config.criticalLow !== undefined && currentValue <= config.criticalLow) {
      return this.buildAnomaly(config, currentValue, history, zScore, 'CRITICAL', `${config.label} est à ${currentValue} (seuil critique: ${config.criticalLow})`);
    }
    if (config.criticalHigh !== undefined && currentValue >= config.criticalHigh) {
      return this.buildAnomaly(config, currentValue, history, zScore, 'CRITICAL', `${config.label} est à ${currentValue} (seuil critique: ${config.criticalHigh})`);
    }
    if (config.warningLow !== undefined && currentValue <= config.warningLow) {
      return this.buildAnomaly(config, currentValue, history, zScore, 'WARNING', `${config.label} est à ${currentValue} (seuil warning: ${config.warningLow})`);
    }
    if (config.warningHigh !== undefined && currentValue >= config.warningHigh) {
      return this.buildAnomaly(config, currentValue, history, zScore, 'WARNING', `${config.label} est à ${currentValue} (seuil warning: ${config.warningHigh})`);
    }

    return null;
  }

  private buildAnomaly(
    config: MetricConfig,
    currentValue: number,
    history: number[],
    zScore: number,
    seuilType: 'WARNING' | 'CRITICAL',
    message: string,
  ): Anomaly {
    const mean = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0;
    const variance = history.length > 1
      ? history.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (history.length - 1)
      : 0;
    const stddev = Math.sqrt(variance);

    return {
      metrique: config.name,
      valeurActuelle: currentValue,
      moyenne7j: mean,
      ecartType: stddev,
      zScore,
      seuilType,
      message,
    };
  }

  calculateZScore(current: number, history: number[]): number {
    if (history.length < 3) return 0;

    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (history.length - 1);
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return 0;

    return (current - mean) / stddev;
  }

  private async persistAnomalies(anomalies: Anomaly[]): Promise<void> {
    for (const anomaly of anomalies) {
      try {
        await this.prisma.alertes.create({
          data: {
            severity: anomaly.seuilType === 'CRITICAL' ? AlertSeverity.critical : AlertSeverity.warning,
            title: `Anomalie: ${anomaly.metrique}`,
            description: anomaly.message,
            category: 'anomaly',
            metricName: anomaly.metrique,
            metricValue: anomaly.valeurActuelle,
          },
        });
      } catch (error) {
        this.logger.warn({ msg: 'Failed to persist anomaly', metrique: anomaly.metrique, error: (error as Error).message });
      }
    }
  }

  private async sendSlackAlert(anomalies: Anomaly[], date: string): Promise<void> {
    const slackWebhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) {
      this.logger.warn({ msg: 'SLACK_WEBHOOK_URL not configured, skipping Slack notification' });
      return;
    }

    const criticalWebhookUrl = this.configService.get<string>('SLACK_CRITICAL_WEBHOOK_URL', slackWebhookUrl);

    const criticals = anomalies.filter((a) => a.seuilType === 'CRITICAL');
    const warnings = anomalies.filter((a) => a.seuilType === 'WARNING');

    if (criticals.length > 0) {
      await this.sendAlertGroup(criticals, date, criticalWebhookUrl, 'critical');
    }
    if (warnings.length > 0) {
      await this.sendAlertGroup(warnings, date, slackWebhookUrl, 'warning');
    }
  }

  private async sendAlertGroup(
    anomalies: Anomaly[],
    date: string,
    webhookUrl: string,
    severity: string,
  ): Promise<void> {
    const allowedMetrics = new Set<string>();
    for (const anomaly of anomalies) {
      const key = `slack-alerts:${anomaly.metrique}:${date}`;
      try {
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, 86400);
        }
        if (count <= 10) {
          allowedMetrics.add(anomaly.metrique);
        } else {
          this.logger.debug({ msg: 'Slack rate limit reached for metric', metric: anomaly.metrique, date });
        }
      } catch {
        allowedMetrics.add(anomaly.metrique);
      }
    }

    const filtered = anomalies.filter((a) => allowedMetrics.has(a.metrique));
    if (filtered.length === 0) return;

    const text = this.buildSlackText(filtered, date);
    try {
      await firstValueFrom(this.httpService.post(webhookUrl, { text }));
      this.logger.log({ msg: 'Slack alert sent', severity, count: filtered.length });
    } catch (error) {
      this.logger.warn({ msg: 'Failed to send Slack alert', severity, error: (error as Error).message });
    }
  }

  private buildSlackText(anomalies: Anomaly[], date: string): string {
    if (anomalies.length > 5) {
      const criticals = anomalies.filter((a) => a.seuilType === 'CRITICAL');
      const warnings = anomalies.filter((a) => a.seuilType === 'WARNING');
      return `*[Analyste] ${anomalies.length} anomalies détectées le ${date}*\n` +
        `- ${criticals.length} CRITICAL\n` +
        `- ${warnings.length} WARNING\n\n` +
        anomalies
          .slice(0, 5)
          .map((a) => `• ${a.seuilType === 'CRITICAL' ? ':red_circle:' : ':warning:'} ${a.message}`)
          .join('\n') +
        `\n_...et ${anomalies.length - 5} autres_`;
    }
    return `*[Analyste] Anomalies détectées le ${date}*\n\n` +
      anomalies
        .map((a) => `• ${a.seuilType === 'CRITICAL' ? ':red_circle:' : ':warning:'} ${a.message}`)
        .join('\n');
  }
}
