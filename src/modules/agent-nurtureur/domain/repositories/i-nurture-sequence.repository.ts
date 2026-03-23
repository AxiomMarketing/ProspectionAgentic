import { NurtureSequence } from '../entities/nurture-sequence.entity';

export abstract class INurtureSequenceRepository {
  abstract findById(id: string): Promise<NurtureSequence | null>;
  abstract findByProspectId(prospectId: string): Promise<NurtureSequence | null>;
  abstract findActive(limit?: number): Promise<NurtureSequence[]>;
  abstract save(sequence: NurtureSequence): Promise<NurtureSequence>;
  abstract update(sequence: NurtureSequence): Promise<NurtureSequence>;
}
