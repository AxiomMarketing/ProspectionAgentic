import { DomainException } from './domain.exception';

export class DuplicateLeadException extends DomainException {
  constructor(identifier: string) {
    super('DUPLICATE_LEAD', `Duplicate lead detected: ${identifier}`, 409);
  }
}
