import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { DealStage } from '../../domain/entities/deal.entity';
import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default ?? IORedis;

export type EngagementSignal =
  | 'devis_ouvert'
  | 'devis_multi_ouvert'
  | 'page_pricing'
  | 'reponse_question'
  | 'linkedin_engagement'
  | 'forward_interne'
  | 'demande_info'
  | 'meeting_accepte';

const ENGAGEMENT_SIGNAL_POINTS: Record<EngagementSignal, number> = {
  devis_ouvert: 1,
  devis_multi_ouvert: 20,
  page_pricing: 20,
  reponse_question: 25,
  linkedin_engagement: 10,
  forward_interne: 15,
  demande_info: 20,
  meeting_accepte: 50,
};

type ObjectionType =
  | 'prix_eleve'
  | 'timing'
  | 'concurrence'
  | 'budget'
  | 'inaction'
  | 'aucune';

export interface ObjectionResult {
  type: ObjectionType;
  confidence: number;
  rawReply: string;
}

const TERMINAL_STAGES: DealStage[] = [DealStage.GAGNE, DealStage.PERDU, DealStage.SIGNATURE_EN_COURS];

const FOLLOW_UP_DELAYS_MS: Record<number, number> = {
  1: 3 * 24 * 60 * 60 * 1000,
  2: 7 * 24 * 60 * 60 * 1000,
  3: 14 * 24 * 60 * 60 * 1000,
};

const FOLLOW_UP_TEMPLATES: Record<number, { subject: string; body: string }> = {
  1: {
    subject: 'Relance J+3 — Avez-vous eu le temps de consulter notre proposition ?',
    body: `Bonjour,\n\nJe me permets de revenir vers vous suite à notre échange. Avez-vous eu l'occasion de consulter la proposition que je vous ai fait parvenir ?\n\nJe reste disponible pour répondre à vos questions ou organiser un point téléphonique à votre convenance.\n\nCordialement,`,
  },
  2: {
    subject: 'Relance J+7 — Votre projet et notre offre',
    body: `Bonjour,\n\nJe souhaitais vous relancer concernant votre projet. Nos solutions ont récemment permis à plusieurs entreprises similaires d'obtenir des résultats significatifs.\n\nSeriez-vous disponible pour un échange de 20 minutes cette semaine ?\n\nCordialement,`,
  },
  3: {
    subject: 'Relance J+14 — Dernière tentative de contact',
    body: `Bonjour,\n\nJe vous contacte une dernière fois au sujet de votre projet. Si le timing n'est pas opportun, je comprends tout à fait et ne vous importunerai plus.\n\nN'hésitez pas à me recontacter si votre situation évolue.\n\nCordialement,`,
  },
};

const OBJECTION_TEMPLATES: Record<ObjectionType, { subject: string; body: string }> = {
  prix_eleve: {
    subject: `Notre offre \u2014 possibilit\u00e9s d'adaptation`,
    body: `Bonjour,\n\nJe comprends votre pr\u00e9occupation sur le budget. Sachez que nous pouvons adapter notre proposition \u00e0 vos contraintes \u2014 phaser les prestations ou ajuster le p\u00e9rim\u00e8tre sans compromis sur la qualit\u00e9.\n\nPouvons-nous en discuter ?\n\nCordialement,`,
  },
  timing: {
    subject: `Votre projet \u2014 \u00e0 quel horizon ?`,
    body: `Bonjour,\n\nJe note que le timing n'est pas encore optimal pour vous. Pouvez-vous me pr\u00e9ciser \u00e0 quel horizon votre projet pourrait se concr\u00e9tiser ? Cela me permettra de revenir vers vous au bon moment.\n\nCordialement,`,
  },
  concurrence: {
    subject: `Notre diff\u00e9renciation par rapport au march\u00e9`,
    body: `Bonjour,\n\nJe comprends que vous \u00e9tudiez plusieurs options. Je serais ravi de vous pr\u00e9senter ce qui nous distingue concr\u00e8tement des autres acteurs, notamment en termes de r\u00e9sultats mesurables et d'accompagnement.\n\nDisponible pour un point rapide ?\n\nCordialement,`,
  },
  budget: {
    subject: `Solutions adapt\u00e9es \u00e0 votre budget`,
    body: `Bonjour,\n\nLes contraintes budg\u00e9taires sont une r\u00e9alit\u00e9 que nous connaissons bien. Nous proposons des formules modulables permettant de d\u00e9marrer avec un investissement limit\u00e9 et d'\u00e9voluer selon les r\u00e9sultats obtenus.\n\nSeriez-vous ouvert \u00e0 explorer ces options ?\n\nCordialement,`,
  },
  inaction: {
    subject: `Votre projet \u2014 besoin d'un coup de pouce ?`,
    body: `Bonjour,\n\nParfois, la difficult\u00e9 est de savoir par o\u00f9 commencer. Nous avons accompagn\u00e9 de nombreux clients dans cette situation en d\u00e9finissant ensemble une feuille de route claire et progressive.\n\nUn \u00e9change de 30 minutes suffit souvent \u00e0 d\u00e9bloquer la situation. Int\u00e9ress\u00e9 ?\n\nCordialement,`,
  },
  aucune: {
    subject: `Suite de nos \u00e9changes`,
    body: `Bonjour,\n\nJe souhaite m'assurer que vous avez bien toutes les informations n\u00e9cessaires pour prendre une d\u00e9cision \u00e9clair\u00e9e. N'h\u00e9sitez pas \u00e0 me faire part de vos questions ou doutes.\n\nCordialement,`,
  },
};

function buildLcenFooter(configService: ConfigService): string {
  const siret = configService.get<string>('AXIOM_SIRET') ?? 'SIRET non renseigné';
  const address = configService.get<string>('AXIOM_ADDRESS') ?? '';
  const unsubUrl = configService.get<string>('UNSUBSCRIBE_BASE_URL') ?? '#';
  return `\n\n---\nAxiom Marketing — ${siret}\n${address}\nPour ne plus recevoir nos emails : ${unsubUrl}`;
}

@Injectable()
export class DealFollowUpService implements OnModuleDestroy {
  private readonly logger = new Logger(DealFollowUpService.name);
  private readonly redis: InstanceType<typeof Redis>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly emailAdapter: IEmailAdapter,
    @InjectQueue(QUEUE_NAMES.NURTURER_PIPELINE) private readonly nurturerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DEALMAKER_PIPELINE) private readonly dealmakerQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.redis.on('error', (err: Error) => {
      this.logger.warn({ msg: 'Redis error in DealFollowUpService', error: err.message });
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

  async scheduleFollowUps(dealId: string): Promise<void> {
    this.logger.log({ msg: 'Scheduling follow-ups', dealId });

    for (const [step, delayMs] of Object.entries(FOLLOW_UP_DELAYS_MS)) {
      await this.dealmakerQueue.add(
        'follow-up',
        { action: 'follow-up', dealId, step: Number(step) },
        { delay: delayMs, jobId: `followup-${dealId}-step-${step}` },
      );
    }

    this.logger.log({ msg: 'Follow-ups scheduled', dealId, steps: Object.keys(FOLLOW_UP_DELAYS_MS) });
  }

  async processFollowUp(dealId: string, step: number): Promise<void> {
    this.logger.log({ msg: 'Processing follow-up', dealId, step });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;

    const deal = await prismaAny.dealCrm.findUnique({
      where: { id: dealId },
      include: { prospect: true },
    }) as { id: string; stage: string; prospect: { email: string | null; companyName: string | null } | null; prospectId: string; derniereRelanceAt: Date | null } | null;

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    if (TERMINAL_STAGES.includes(deal.stage as DealStage)) {
      this.logger.log({ msg: 'Deal in terminal stage, skipping follow-up', dealId, stage: deal.stage });
      return;
    }

    if (deal.derniereRelanceAt) {
      const hoursSinceLastReply = (Date.now() - deal.derniereRelanceAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastReply < 48) {
        this.logger.log({ msg: 'Prospect replied recently (<48h), skipping follow-up', dealId });
        return;
      }
    }

    if (deal.derniereRelanceAt) {
      const daysSinceLastContact = (Date.now() - deal.derniereRelanceAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastContact < 3) {
        this.logger.log({ msg: 'Last contact < 3 days ago, skipping follow-up', dealId });
        return;
      }
    }

    const template = FOLLOW_UP_TEMPLATES[step] ?? FOLLOW_UP_TEMPLATES[3];
    const prospectEmail = deal.prospect?.email;

    if (!prospectEmail) {
      this.logger.warn({ msg: 'No email for prospect, cannot send follow-up', dealId });
      return;
    }

    const fromEmail = this.configService.get<string>('GMAIL_USER') ?? 'noreply@axiom-marketing.fr';
    const bodyWithFooter = template.body + buildLcenFooter(this.configService);

    await this.emailAdapter.sendEmail({
      from: fromEmail,
      to: [prospectEmail],
      subject: template.subject,
      htmlBody: bodyWithFooter,
      headers: {
        'X-Axiom-Deal-ID': dealId,
        'X-Axiom-Follow-Up-Step': String(step),
      },
    });

    await prismaAny.dealCrm.update({
      where: { id: dealId },
      data: {
        nbRelances: { increment: 1 },
        derniereRelanceAt: new Date(),
      },
    });

    await prismaAny.dealActivity.create({
      data: {
        dealId,
        type: 'follow_up_sent',
        step,
        details: { subject: template.subject, prospectEmail },
      },
    });

    this.logger.log({ msg: 'Follow-up sent', dealId, step });
  }

  async trackEngagement(dealId: string, signal: EngagementSignal): Promise<void> {
    this.logger.log({ msg: 'Tracking engagement', dealId, signal });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;

    const points = ENGAGEMENT_SIGNAL_POINTS[signal];

    const existing = await prismaAny.engagementScore.findUnique({ where: { dealId } }) as { score: number; signals: unknown[] } | null;

    let newScore: number;
    let signals: unknown[];

    if (existing) {
      newScore = existing.score + points;
      signals = [...((existing.signals as unknown[]) ?? []), { signal, points, recordedAt: new Date().toISOString() }];
      await prismaAny.engagementScore.update({
        where: { dealId },
        data: { score: newScore, signals, lastUpdated: new Date() },
      });
    } else {
      newScore = points;
      signals = [{ signal, points, recordedAt: new Date().toISOString() }];
      await prismaAny.engagementScore.create({
        data: { dealId, score: newScore, signals, lastUpdated: new Date() },
      });
    }

    await prismaAny.dealActivity.create({
      data: {
        dealId,
        type: 'engagement_signal',
        engagementDelta: points,
        details: { signal, newScore },
      },
    });

    if (newScore >= 75) {
      this.logger.log({ msg: 'Deal ready to sign — engagement >= 75', dealId, score: newScore });
    } else if (newScore >= 25) {
      this.logger.log({ msg: 'Deal escalation threshold reached — engagement >= 25', dealId, score: newScore });
    }
  }

  async classifyObjection(reply: string): Promise<ObjectionResult> {
    const allowedTypes: ObjectionType[] = ['prix_eleve', 'timing', 'concurrence', 'budget', 'inaction', 'aucune'];

    const systemPrompt = `Tu es un expert en analyse d'objections dans des emails de prospection B2B pour Axiom Marketing.

Classe l'objection dans l'une des catégories suivantes UNIQUEMENT:
- prix_eleve: Le prospect trouve le prix trop élevé
- timing: Le prospect indique que le moment n'est pas opportun
- concurrence: Le prospect mentionne un concurrent ou préfère une autre solution
- budget: Le prospect indique un manque de budget
- inaction: Le prospect ne répond pas / manque d'urgence / procrastination
- aucune: Pas d'objection claire identifiable

Réponds UNIQUEMENT en JSON valide:
{
  "type": "une_des_six_categories",
  "confidence": 0.95,
  "raisonnement": "Explication courte"
}`;

    const userPrompt = `Email du prospect:\n"${reply.substring(0, 2000)}"`;

    const result = await this.llmService.call({
      task: LlmTask.CLASSIFY_REPLY,
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      maxTokens: 300,
    });

    try {
      const parsed = JSON.parse(result.content) as { type: string; confidence: number };
      const type = allowedTypes.includes(parsed.type as ObjectionType)
        ? (parsed.type as ObjectionType)
        : 'aucune';
      const confidence = parsed.confidence >= 0.7 ? parsed.confidence : 0;

      return { type: confidence > 0 ? type : 'aucune', confidence, rawReply: reply };
    } catch {
      this.logger.warn({ msg: 'Failed to parse objection classification', content: result.content });
      return { type: 'aucune', confidence: 0, rawReply: reply };
    }
  }

  async handleObjection(dealId: string, objection: ObjectionResult): Promise<void> {
    this.logger.log({ msg: 'Handling objection', dealId, type: objection.type });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;

    const deal = await prismaAny.dealCrm.findUnique({
      where: { id: dealId },
      include: { prospect: true },
    }) as { id: string; prospectId: string; prospect: { email: string | null } | null } | null;

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    const template = OBJECTION_TEMPLATES[objection.type];
    const prospectEmail = deal.prospect?.email;

    if (prospectEmail) {
      const fromEmail = this.configService.get<string>('GMAIL_USER') ?? 'noreply@axiom-marketing.fr';
      const bodyWithFooter = template.body + buildLcenFooter(this.configService);

      await this.emailAdapter.sendEmail({
        from: fromEmail,
        to: [prospectEmail],
        subject: template.subject,
        htmlBody: bodyWithFooter,
        headers: { 'X-Axiom-Deal-ID': dealId, 'X-Axiom-Objection-Type': objection.type },
      });
    }

    await prismaAny.dealCrm.update({
      where: { id: dealId },
      data: {
        stage: DealStage.NEGOCIATION,
        derniereObjection: objection.type,
      },
    });

    await prismaAny.dealActivity.create({
      data: {
        dealId,
        type: 'objection_handled',
        details: { objectionType: objection.type, confidence: objection.confidence },
      },
    });

    const unresolvedObjections = await prismaAny.dealActivity.count({
      where: { dealId, type: 'objection_handled' },
    }) as number;

    if (unresolvedObjections >= 3) {
      this.logger.warn({ msg: 'Deal has 3+ unresolved objections — escalade', dealId, count: unresolvedObjections });
    }
  }

  async markLost(dealId: string, reason: string): Promise<void> {
    this.logger.log({ msg: 'Marking deal as lost', dealId, reason });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;

    const deal = await prismaAny.dealCrm.findUnique({
      where: { id: dealId },
      include: { prospect: true },
    }) as { id: string; prospectId: string; prospect: { companyName: string | null } | null } | null;

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    await prismaAny.dealCrm.update({
      where: { id: dealId },
      data: {
        stage: DealStage.PERDU,
        lostReason: reason,
        lostAt: new Date(),
        closedAt: new Date(),
      },
    });

    await prismaAny.dealActivity.create({
      data: {
        dealId,
        type: 'deal_lost',
        details: { reason },
      },
    });

    await this.nurturerQueue.add('lost-deal-to-nurture', {
      dealId,
      prospectId: deal.prospectId,
      companyName: deal.prospect?.companyName ?? 'Unknown',
      lostReason: reason,
      lostAt: new Date().toISOString(),
    });

    this.logger.log({ msg: 'Deal marked as lost and dispatched to Agent 6 Nurtureur', dealId });
  }

  @Cron('0 6 * * *')
  async checkTimeout(): Promise<void> {
    if (!await this.acquireCronLock('deal-timeout-check', 300)) return;
    this.logger.log({ msg: 'Running daily timeout check for stale deals' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;

    const cutoffDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const terminalStages: string[] = [DealStage.GAGNE, DealStage.PERDU, DealStage.SIGNATURE_EN_COURS];

    const staleDeals = await prismaAny.dealCrm.findMany({
      where: {
        updatedAt: { lt: cutoffDate },
        stage: { notIn: terminalStages },
      },
      select: { id: true, stage: true },
    }) as Array<{ id: string; stage: string }>;

    this.logger.log({ msg: 'Stale deals found', count: staleDeals.length });

    for (const deal of staleDeals) {
      try {
        await this.markLost(deal.id, 'INACTION');
      } catch (error) {
        this.logger.error({ msg: 'Failed to auto-close stale deal', dealId: deal.id, error: (error as Error).message });
      }
    }
  }
}
