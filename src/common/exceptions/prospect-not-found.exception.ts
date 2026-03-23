import { DomainException } from './domain.exception';

export class ProspectNotFoundException extends DomainException {
  constructor(identifier: string) {
    super('PROSPECT_NOT_FOUND', `Prospect not found: ${identifier}`, 404);
  }
}
