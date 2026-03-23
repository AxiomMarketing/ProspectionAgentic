import { MessageSend } from '../entities/message-send.entity';

export abstract class IMessageSendRepository {
  abstract findById(id: string): Promise<MessageSend | null>;
  abstract findByProspectId(prospectId: string): Promise<MessageSend[]>;
  abstract save(messageSend: MessageSend): Promise<MessageSend>;
  abstract updateStatus(messageSend: MessageSend): Promise<MessageSend>;
}
