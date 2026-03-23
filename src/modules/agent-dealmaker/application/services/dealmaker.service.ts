import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IDealRepository } from '../../domain/repositories/i-deal.repository';
import { IQuoteRepository } from '../../domain/repositories/i-quote.repository';
import { Deal, DealStage } from '../../domain/entities/deal.entity';
import { Quote } from '../../domain/entities/quote.entity';
import { CreateDealDto, GenerateQuoteDto } from '../dtos/dealmaker.dto';
import { PricingService } from './pricing.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Injectable()
export class DealmakerService {
  private readonly logger = new Logger(DealmakerService.name);

  constructor(
    private readonly dealRepository: IDealRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly pricingService: PricingService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.CSM_ONBOARDING) private readonly csmOnboardingQueue: Queue,
  ) {}

  async createDeal(dto: CreateDealDto): Promise<Deal> {
    this.logger.log({ msg: 'Creating deal', prospectId: dto.prospectId });
    const deal = Deal.create({
      prospectId: dto.prospectId,
      title: dto.title,
      amountEur: dto.amountEur,
      probability: dto.probability,
      expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
    });
    const saved = await this.dealRepository.save(deal);
    this.eventEmitter.emit('deal.created', { dealId: saved.id, prospectId: saved.prospectId });
    return saved;
  }

  async generateQuote(
    dto: GenerateQuoteDto & { serviceType?: string; tier?: string },
  ): Promise<Quote> {
    this.logger.log({ msg: 'Generating quote', dealId: dto.dealId });
    const quoteNumber = `QT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let lineItems = dto.lineItems;
    let amountHtEur = dto.amountHtEur;

    if (dto.serviceType && dto.tier) {
      lineItems = this.pricingService.generateLineItems(dto.serviceType, dto.tier);
      amountHtEur = this.pricingService.getPrice(dto.serviceType, dto.tier);
    }

    const quote = Quote.create({ ...dto, quoteNumber, lineItems, amountHtEur });
    return this.quoteRepository.save(quote);
  }

  async advanceStage(dealId: string, newStage: DealStage): Promise<Deal> {
    const deal = await this.dealRepository.findById(dealId);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const advanced = deal.advanceStage(newStage);
    const saved = await this.dealRepository.update(advanced);

    this.eventEmitter.emit('deal.stage_changed', { dealId, newStage });

    if (newStage === DealStage.CLOSED_WON) {
      await this.csmOnboardingQueue.add('onboard-customer', {
        dealId,
        prospectId: saved.prospectId,
      });
      this.logger.log({ msg: 'Deal won — dispatched to CSM onboarding', dealId });
    }

    return saved;
  }
}
