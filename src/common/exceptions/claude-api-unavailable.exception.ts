import { DomainException } from './domain.exception';

export class ClaudeApiUnavailableException extends DomainException {
  constructor(detail?: string) {
    super('CLAUDE_API_UNAVAILABLE', `Claude API unavailable${detail ? `: ${detail}` : ''}`, 503);
  }
}
