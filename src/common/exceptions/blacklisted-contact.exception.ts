import { DomainException } from './domain.exception';

export class BlacklistedContactException extends DomainException {
  constructor(reason?: string) {
    super('BLACKLISTED_CONTACT', `Contact is blacklisted${reason ? `: ${reason}` : ''}`, 403);
  }
}
