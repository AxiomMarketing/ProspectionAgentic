import { Tender, TenderStatus } from '../entities/tender.entity';

export abstract class ITenderRepository {
  abstract findById(id: string): Promise<Tender | null>;
  abstract findByStatus(status: TenderStatus): Promise<Tender[]>;
  abstract findUpcoming(before: Date): Promise<Tender[]>;
  abstract save(tender: Tender): Promise<Tender>;
  abstract update(tender: Tender): Promise<Tender>;
}
