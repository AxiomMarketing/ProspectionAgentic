import { DomainException } from './domain.exception';

export class ScoringCalculationException extends DomainException {
  constructor(detail: string) {
    super('SCORING_CALCULATION_ERROR', `Scoring calculation error: ${detail}`, 422);
  }
}
