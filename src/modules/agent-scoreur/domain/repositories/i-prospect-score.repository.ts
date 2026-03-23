import { ProspectScore } from '../entities/prospect-score.entity';

export abstract class IProspectScoreRepository {
  abstract findLatestByProspectId(prospectId: string): Promise<ProspectScore | null>;
  abstract findByProspectId(prospectId: string): Promise<ProspectScore[]>;
  abstract save(score: ProspectScore): Promise<ProspectScore>;
}
