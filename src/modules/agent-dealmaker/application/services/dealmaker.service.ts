import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IDealRepository } from '../../domain/repositories/i-deal.repository';
import { IQuoteRepository } from '../../domain/repositories/i-quote.repository';
import { Deal, DealStage } from '../../domain/entities/deal.entity';
import { Quote } from '../../domain/entities/quote.entity';
import { CreateDealDto, GenerateQuoteDto } from '../dtos/dealmaker.dto';

@Injectable()
export class DealmakerService {
  private readonly logger = new Logger(DealmakerService.name);

  constructor(
    private readonly dealRepository: IDealRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly eventEmitter: EventEmitter2,
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

  async generateQuote(dto: GenerateQuoteDto): Promise<Quote> {
    this.logger.log({ msg: 'Generating quote', dealId: dto.dealId });
    const quoteNumber = `QT-${Date.now()}`;
    const quote = Quote.create({ ...dto, quoteNumber });
    return this.quoteRepository.save(quote);
  }

  async advanceStage(dealId: string, newStage: DealStage): Promise<Deal> {
    const deal = await this.dealRepository.findById(dealId);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const advanced = deal.advanceStage(newStage);
    this.eventEmitter.emit('deal.stage_changed', { dealId, newStage });
    return this.dealRepository.update(advanced);
  }
}
