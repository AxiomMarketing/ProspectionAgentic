import { Quote } from '../entities/quote.entity';

export abstract class IQuoteRepository {
  abstract findById(id: string): Promise<Quote | null>;
  abstract findByDealId(dealId: string): Promise<Quote[]>;
  abstract findActiveByDealId(dealId: string): Promise<Quote[]>;
  abstract expirePreviousQuotes(dealId: string): Promise<void>;
  abstract save(quote: Quote): Promise<Quote>;
  abstract update(quote: Quote): Promise<Quote>;
}
