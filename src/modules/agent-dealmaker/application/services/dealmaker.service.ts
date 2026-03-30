import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IDealRepository } from '../../domain/repositories/i-deal.repository';
import { IQuoteRepository } from '../../domain/repositories/i-quote.repository';
import { Deal, DealStage } from '../../domain/entities/deal.entity';
import { Quote } from '../../domain/entities/quote.entity';
import { CreateDealDto } from '../dtos/dealmaker.dto';
import { QuoteGeneratorService } from './quote-generator.service';
import { DealFollowUpService } from './deal-followup.service';
import { YousignService } from './yousign.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

const TERMINAL_STAGES = new Set<DealStage>([DealStage.GAGNE, DealStage.PERDU]);

@Injectable()
export class DealmakerService {
  private readonly logger = new Logger(DealmakerService.name);

  constructor(
    private readonly dealRepository: IDealRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly quoteGeneratorService: QuoteGeneratorService,
    private readonly dealFollowUpService: DealFollowUpService,
    private readonly yousignService: YousignService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentEventLogger: AgentEventLoggerService,
    @InjectQueue(QUEUE_NAMES.CSM_ONBOARDING) private readonly csmOnboardingQueue: Queue,
  ) {}

  async createDeal(input: CreateDealDto, userId: string): Promise<Deal> {
    this.logger.log({ msg: 'Creating deal', prospectId: input.prospectId, userId });

    // Verify prospect exists
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: input.prospectId },
      select: { id: true },
    });
    if (!prospect) {
      throw new NotFoundException(`Prospect ${input.prospectId} not found`);
    }

    // Check no active deal exists for this prospect
    const activeDeals = await this.dealRepository.findActiveByProspectId(input.prospectId);
    if (activeDeals.length > 0) {
      throw new ConflictException(`Prospect ${input.prospectId} already has an active deal`);
    }

    const deal = Deal.create({
      prospectId: input.prospectId,
      title: input.title,
      amountEur: input.amountEur,
      probability: input.probability,
      expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
    });

    const saved = await this.dealRepository.save(deal);

    this.eventEmitter.emit('deal.created', {
      dealId: saved.id,
      prospectId: saved.prospectId,
      userId,
    });

    await this.agentEventLogger.log({
      agentName: 'dealmaker',
      eventType: 'deal_created',
      payload: { dealId: saved.id, prospectId: saved.prospectId, userId },
    });

    return saved;
  }

  async advanceStage(
    id: string,
    stage: DealStage,
    reason: string | undefined,
    userId: string,
  ): Promise<Deal> {
    const deal = await this.dealRepository.findById(id);
    if (!deal) throw new NotFoundException(`Deal ${id} not found`);

    const snapshotUpdatedAt = deal.updatedAt;

    // IDOR check: only allow if deal belongs to the user's scope (non-admin check delegated to guard)
    // For terminal stages, use close() which sets closedAt/wonReason/lostReason
    let advanced: Deal;
    if (TERMINAL_STAGES.has(stage)) {
      if (!reason) {
        throw new ConflictException(`A reason is required when closing a deal as ${stage}`);
      }
      advanced = deal.close(stage === DealStage.GAGNE, reason);
    } else {
      advanced = deal.advanceStage(stage);
    }

    // Optimistic locking: verify the record was not modified between read and write
    const plain = advanced.toPlainObject();
    const updateResult = await this.prisma.dealCrm.updateMany({
      where: { id, updatedAt: snapshotUpdatedAt },
      data: {
        stage: plain.stage as unknown as never,
        amountEur: plain.amountEur,
        probability: plain.probability,
        expectedCloseDate: plain.expectedCloseDate,
        closedAt: plain.closedAt,
        wonReason: plain.wonReason,
        lostReason: plain.lostReason,
        stageHistory: plain.stageHistory as unknown as never,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException('Deal was modified concurrently');
    }

    const saved = await this.dealRepository.findById(id) as Deal;

    this.eventEmitter.emit('deal.stage_changed', { dealId: id, newStage: stage, userId });

    await this.agentEventLogger.log({
      agentName: 'dealmaker',
      eventType: 'stage_advanced',
      payload: { dealId: id, newStage: stage, userId },
    });

    if (stage === DealStage.GAGNE) {
      const prospect = await this.prisma.prospect.findUnique({
        where: { id: saved.prospectId },
        select: { companyName: true },
      });

      await this.csmOnboardingQueue.add('onboard-customer', {
        dealId: saved.id,
        prospectId: saved.prospectId,
        companyName: prospect?.companyName ?? 'Unknown',
        mrrEur: saved.amountEur ?? 0,
      });

      this.logger.log({ msg: 'Deal won — dispatched to CSM onboarding', dealId: id });
    }

    return saved;
  }

  async getDeal(id: string): Promise<Deal> {
    const deal = await this.dealRepository.findById(id);
    if (!deal) throw new NotFoundException(`Deal ${id} not found`);
    return deal;
  }

  async listDeals(pagination: { take: number; skip: number }): Promise<Deal[]> {
    return this.dealRepository.findAll(pagination);
  }

  async generateQuote(dealId: string, prospectId: string): Promise<{ quoteId: string; trackingId: string }> {
    return this.quoteGeneratorService.generateQuote(dealId, prospectId);
  }

  async startSignatureProcess(dealId: string): Promise<void> {
    const deal = await this.dealRepository.findById(dealId);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);

    const quotes = await this.quoteRepository.findActiveByDealId(dealId);
    if (quotes.length === 0) {
      throw new ConflictException(`Deal ${dealId} has no active quote to sign`);
    }

    await this.yousignService.createSignatureProcess(deal, quotes[0]);
  }

  async handleYousignWebhook(
    eventType: string,
    payload: Record<string, unknown>,
    signature: string | undefined,
  ): Promise<void> {
    const secret = this.configService.get<string>('YOUSIGN_WEBHOOK_SECRET');
    if (secret) {
      const isValid = await this.verifyHmacSignature(payload, signature, secret);
      if (!isValid) {
        throw new ForbiddenException('Invalid Yousign webhook signature');
      }
    }
    await this.yousignService.handleWebhook(eventType, payload);
  }

  async handleTrackingPixel(
    trackingId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<Buffer> {
    return this.quoteGeneratorService.handleTrackingPixel(trackingId, ip, userAgent);
  }

  private async verifyHmacSignature(
    payload: Record<string, unknown>,
    signature: string | undefined,
    secret: string,
  ): Promise<boolean> {
    if (!signature) return false;
    const { createHmac } = await import('crypto');
    const body = JSON.stringify(payload);
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    // Constant-time comparison using Buffer
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    const { timingSafeEqual } = await import('crypto');
    return timingSafeEqual(sigBuf, expBuf);
  }
}
