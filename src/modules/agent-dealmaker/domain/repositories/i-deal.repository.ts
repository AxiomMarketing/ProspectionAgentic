import { Deal, DealStage } from '../entities/deal.entity';

export abstract class IDealRepository {
  abstract findById(id: string): Promise<Deal | null>;
  abstract findByProspectId(prospectId: string): Promise<Deal[]>;
  abstract findByStage(stage: DealStage): Promise<Deal[]>;
  abstract save(deal: Deal): Promise<Deal>;
  abstract update(deal: Deal): Promise<Deal>;
}
