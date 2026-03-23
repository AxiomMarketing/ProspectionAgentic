import { GeneratedMessage } from '../entities/generated-message.entity';

export abstract class IGeneratedMessageRepository {
  abstract findById(id: string): Promise<GeneratedMessage | null>;
  abstract findByProspectId(prospectId: string): Promise<GeneratedMessage[]>;
  abstract save(message: GeneratedMessage): Promise<GeneratedMessage>;
}
