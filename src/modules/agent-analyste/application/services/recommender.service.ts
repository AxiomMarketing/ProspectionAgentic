import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

const VALID_TYPES = [
  'ajuster_poids',
  'desactiver_template',
  'ajouter_mot_cle',
  'ajuster_sequence',
  'ajuster_frequence',
  'ajuster_source',
  'ajuster_sunset',
  'recalibrer_scoring',
] as const;

const VALID_AGENTS = [
  'agent_1_veilleur',
  'agent_3_scoreur',
  'agent_4_redacteur',
  'agent_5_suiveur',
  'agent_6_nurtureur',
  'global',
] as const;

type ValidType = (typeof VALID_TYPES)[number];
type ValidAgent = (typeof VALID_AGENTS)[number];

interface RecommendationInput {
  type: ValidType;
  title: string;
  description: string;
  priority: number;
  targetType: ValidAgent;
}

interface ABTestResult {
  zScore?: number;
  pValue?: number;
  significant: boolean;
  gagnant: 'A' | 'B' | 'TIE';
  reason?: string;
}

@Injectable()
export class RecommenderService implements OnModuleDestroy {
  private readonly logger = new Logger(RecommenderService.name);
  private readonly redis: InstanceType<typeof Redis>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis error in RecommenderService', error: err.message });
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

  @Cron('30 9 * * 1')
  async generateRecommendations(): Promise<void> {
    if (!await this.acquireCronLock('weekly-recommendations', 600)) return;
    this.logger.log({ msg: 'Starting weekly recommendation generation' });

    const results = await Promise.allSettled([
      this.analyzeTemplatePerformance(),
      this.analyzeScoringPrecision(),
      this.analyzeSourcePerformance(),
      this.analyzeSequencePerformance(),
      this.analyzeNurturePerformance(),
    ]);

    const allRecs: RecommendationInput[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allRecs.push(...result.value);
      } else {
        this.logger.error({ msg: 'Analysis function failed', error: result.reason?.message });
      }
    }

    for (const rec of allRecs) {
      await this.prisma.recommandations.create({
        data: {
          type: rec.type,
          title: rec.title,
          description: rec.description,
          priority: rec.priority,
          targetType: rec.targetType,
          generatedBy: 'agent_7_analyste',
          status: 'pending',
        },
      });
    }

    await this.evaluateRunningABTests();

    let summary = '';
    if (allRecs.length > 0) {
      try {
        const llmResult = await this.llmService.call({
          task: LlmTask.ANALYZE_COMPANY_STRATEGY,
          systemPrompt:
            'Tu es un analyste commercial expert. Génère un résumé concis et actionnable des recommandations du pipeline de prospection.',
          userPrompt: `Voici les recommandations générées cette semaine:\n${JSON.stringify(allRecs, null, 2)}\n\nFais un résumé de 3-5 phrases.`,
          maxTokens: 500,
        });
        summary = llmResult.content;
      } catch (err: any) {
        this.logger.error({ msg: 'LLM summary generation failed', error: err?.message });
        summary = `${allRecs.length} recommandations générées.`;
      }
    } else {
      summary = 'Aucune recommandation générée cette semaine.';
    }

    await this.sendSlackNotification(allRecs.length, summary);

    this.logger.log({ msg: 'Recommendation generation complete', count: allRecs.length });
  }

  async analyzeTemplatePerformance(): Promise<RecommendationInput[]> {
    const recs: RecommendationInput[] = [];

    const templates = await this.prisma.messageTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        totalSent: true,
        totalReplied: true,
      },
    });

    for (const template of templates) {
      if (template.totalSent < 50) continue;
      const replyRate = template.totalSent > 0 ? template.totalReplied / template.totalSent : 0;
      if (replyRate < 0.03) {
        recs.push({
          type: 'desactiver_template',
          title: `Désactiver le template "${template.name}"`,
          description: `Taux de réponse de ${(replyRate * 100).toFixed(1)}% sur ${template.totalSent} envois (seuil: 3%). Recommandation: désactiver ce template.`,
          priority: 3,
          targetType: 'agent_4_redacteur',
        });
      }
    }

    return recs;
  }

  async analyzeScoringPrecision(): Promise<RecommendationInput[]> {
    const recs: RecommendationInput[] = [];

    const hotScores = await this.prisma.prospectScore.findMany({
      where: { segment: 'HOT', isLatest: true },
      select: { prospectId: true },
    });

    if (hotScores.length === 0) return recs;

    const hotProspectIds = hotScores.map((s) => s.prospectId);
    const conversions = await this.prisma.dealCrm.count({
      where: {
        prospectId: { in: hotProspectIds },
        stage: { in: ['GAGNE'] },
      },
    });

    const precision = conversions / hotProspectIds.length;
    if (precision < 0.3) {
      recs.push({
        type: 'recalibrer_scoring',
        title: 'Recalibrer le scoring HOT',
        description: `Précision HOT: ${(precision * 100).toFixed(1)}% (${conversions}/${hotProspectIds.length} conversions). Seuil minimal: 30%. Le modèle de scoring doit être recalibré.`,
        priority: 3,
        targetType: 'agent_3_scoreur',
      });
    }

    return recs;
  }

  async analyzeSourcePerformance(): Promise<RecommendationInput[]> {
    const recs: RecommendationInput[] = [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const leadsBySource = await this.prisma.rawLead.groupBy({
      by: ['source'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    });

    for (const sourceGroup of leadsBySource) {
      if (sourceGroup._count.id <= 50) continue;

      const prospectsFromSource = await this.prisma.rawLead.findMany({
        where: { source: sourceGroup.source, createdAt: { gte: thirtyDaysAgo } },
        select: { prospectId: true },
      });

      const prospectIds = prospectsFromSource
        .filter((l) => l.prospectId !== null)
        .map((l) => l.prospectId as string);

      if (prospectIds.length === 0) continue;

      const deals = await this.prisma.dealCrm.count({
        where: {
          prospectId: { in: prospectIds },
          stage: 'GAGNE',
        },
      });

      if (deals === 0) {
        recs.push({
          type: 'ajuster_source',
          title: `Ajuster la source "${sourceGroup.source}"`,
          description: `Source "${sourceGroup.source}": ${sourceGroup._count.id} leads en 30 jours, 0 conversion. Recommandation: réduire ou ajuster les critères de cette source.`,
          priority: 2,
          targetType: 'agent_1_veilleur',
        });
      }
    }

    return recs;
  }

  async analyzeSequencePerformance(): Promise<RecommendationInput[]> {
    const recs: RecommendationInput[] = [];

    const sequences = await this.prisma.prospectSequence.findMany({
      where: { currentStep: { gte: 3 } },
      select: { id: true, name: true, repliesCount: true, currentStep: true },
    });

    const noReplySequences = sequences.filter((s) => s.repliesCount === 0);

    if (noReplySequences.length > 0) {
      const sampleNames = noReplySequences
        .slice(0, 3)
        .map((s) => s.name)
        .join(', ');
      recs.push({
        type: 'ajuster_sequence',
        title: 'Raccourcir les séquences sans réponse après l\'étape 3',
        description: `${noReplySequences.length} séquences sans réponse après l'étape 3 (ex: ${sampleNames}). Recommandation: raccourcir la séquence ou changer d'approche dès l'étape 3.`,
        priority: 2,
        targetType: 'agent_5_suiveur',
      });
    }

    return recs;
  }

  async analyzeNurturePerformance(): Promise<RecommendationInput[]> {
    const recs: RecommendationInput[] = [];

    const segments = await this.prisma.nurtureProspect.groupBy({
      by: ['segment'],
      where: { segment: { not: null } },
      _count: { id: true },
    });

    for (const seg of segments) {
      if (!seg.segment || seg._count.id < 10) continue;

      const sunsetCount = await this.prisma.nurtureProspect.count({
        where: { segment: seg.segment, exitReason: { contains: 'sunset' } },
      });

      const sunsetRate = sunsetCount / seg._count.id;
      if (sunsetRate > 0.6) {
        recs.push({
          type: 'ajuster_sunset',
          title: `Ajuster la stratégie de nurture pour le segment "${seg.segment}"`,
          description: `Segment "${seg.segment}": taux de sunset ${(sunsetRate * 100).toFixed(1)}% (${sunsetCount}/${seg._count.id}). Seuil: 60%. Recommandation: ajuster la fréquence ou le contenu pour ce segment.`,
          priority: 1,
          targetType: 'agent_6_nurtureur',
        });
      }
    }

    return recs;
  }

  calculateABTestSignificance(
    envoisA: number,
    repliesA: number,
    envoisB: number,
    repliesB: number,
    minSample = 250,
  ): ABTestResult {
    const rateA = envoisA > 0 ? repliesA / envoisA : 0;
    const rateB = envoisB > 0 ? repliesB / envoisB : 0;

    if (envoisA < minSample || envoisB < minSample) {
      return { significant: false, gagnant: 'TIE' as const, reason: 'insufficient_sample' };
    }

    if (repliesA === 0 && repliesB === 0) {
      return { significant: false, gagnant: 'TIE' as const, reason: 'no_replies' };
    }

    const pPooled = (repliesA + repliesB) / (envoisA + envoisB);
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / envoisA + 1 / envoisB));

    if (se === 0) {
      return { significant: false, gagnant: 'TIE' as const };
    }

    const z = (rateB - rateA) / se;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    return {
      zScore: z,
      pValue,
      significant: pValue < 0.05,
      gagnant: pValue >= 0.05 ? 'TIE' : rateB > rateA ? 'B' : 'A',
    };
  }

  async evaluateRunningABTests(): Promise<void> {
    const runningTests = await this.prisma.abTest.findMany({
      where: { status: 'running' },
    });

    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    for (const test of runningTests) {
      const isExpired = test.createdAt < eightWeeksAgo;

      const result = this.calculateABTestSignificance(
        test.sampleSizeA,
        Math.round((test.metricValueA ?? 0) * test.sampleSizeA),
        test.sampleSizeB,
        Math.round((test.metricValueB ?? 0) * test.sampleSizeB),
      );

      if (result.significant || isExpired) {
        const winner = isExpired && !result.significant ? 'TIE' : result.gagnant;
        const concludedReason = isExpired && !result.significant ? 'timeout_8_weeks' : 'significant';

        await this.prisma.abTest.update({
          where: { id: test.id },
          data: {
            status: 'concluded',
            winner,
            confidenceLevel: result.pValue !== undefined ? 1 - result.pValue : null,
            concludedAt: new Date(),
          },
        });

        this.logger.log({
          msg: 'AB test concluded',
          testId: test.id,
          testName: test.name,
          winner,
          reason: concludedReason,
          pValue: result.pValue,
        });
      }
    }
  }

  normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  private async sendSlackNotification(count: number, summary: string): Promise<void> {
    const webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn({ msg: 'SLACK_WEBHOOK_URL not configured — skipping Slack notification' });
      return;
    }

    try {
      await firstValueFrom(
        this.httpService.post(webhookUrl, {
          text: `*Agent 7 Analyste — Recommandations hebdomadaires*\n${count} recommandation(s) générée(s).\n${summary}`,
        }),
      );
    } catch (err: any) {
      this.logger.error({ msg: 'Slack notification failed', error: err?.message });
    }
  }
}
