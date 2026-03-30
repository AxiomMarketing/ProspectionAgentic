import { Injectable, Logger, Optional } from '@nestjs/common';
import { IEmailVerifierAdapter, EmailVerificationResult } from '@common/ports/i-email-verifier.adapter';
import { EmailPatternService } from '../../application/services/email-pattern.service';
import { HunterAdapter } from '../adapters/hunter.adapter';
import { DecideurSelectionService } from './decideur-selection.service';

export interface EmailFinderResult {
  email: string | null;
  confidence: number;
  source: 'smtp_verified' | 'pattern_guess_catchall' | 'hunter_finder' | 'hunter_domain_search' | 'not_found';
  verificationDetails?: EmailVerificationResult;
  patternsChecked: number;
  domain: string;
}

@Injectable()
export class EmailFinderService {
  private readonly logger = new Logger(EmailFinderService.name);

  constructor(
    private readonly emailPatternService: EmailPatternService,
    private readonly emailVerifier: IEmailVerifierAdapter,
    @Optional() private readonly hunterAdapter: HunterAdapter | null,
    @Optional() private readonly decideurSelectionService: DecideurSelectionService | null,
  ) {}

  async findEmail(
    firstName: string,
    lastName: string,
    domain: string,
    employeeCount?: number,
    segment?: string,
  ): Promise<EmailFinderResult> {
    this.logger.log({ msg: 'Starting email search', domain, employeeCount });

    // 1. Generate patterns
    const candidates = this.emailPatternService.generateCandidates(
      firstName, lastName, domain, employeeCount,
    );

    if (candidates.length === 0) {
      return { email: null, confidence: 0, source: 'not_found', patternsChecked: 0, domain };
    }

    // 2. Check if verifier is available
    const verifierAvailable = await this.emailVerifier.isAvailable();
    if (!verifierAvailable) {
      this.logger.warn({ msg: 'Email verifier unavailable, returning best guess', domain });
      return {
        email: candidates[0],
        confidence: 30,
        source: 'pattern_guess_catchall',
        patternsChecked: 0,
        domain,
      };
    }

    // 3. Catch-all pre-check: test a random address
    const randomEmail = `xyztest${Date.now()}@${domain}`;
    const catchAllCheck = await this.emailVerifier.verify(randomEmail);

    if (catchAllCheck.isCatchAll === true) {
      // Domain is catch-all — return best pattern with reduced confidence
      this.logger.log({ msg: 'Catch-all domain detected', domain });
      return {
        email: candidates[0],
        confidence: 60,
        source: 'pattern_guess_catchall',
        verificationDetails: catchAllCheck,
        patternsChecked: 1,
        domain,
      };
    }

    // 4. Waterfall: verify each pattern sequentially
    let patternsChecked = 0;
    for (const candidate of candidates) {
      patternsChecked++;
      try {
        const result = await this.emailVerifier.verify(candidate);

        if (result.isReachable === 'safe' && !result.isCatchAll) {
          // Found a valid email — STOP
          this.logger.log({ msg: 'Email found', domain, confidence: result.confidence, patternsChecked });
          return {
            email: candidate,
            confidence: result.confidence,
            source: 'smtp_verified',
            verificationDetails: result,
            patternsChecked,
            domain,
          };
        }

        if (result.isReachable === 'invalid') {
          // Definitely not valid — continue to next pattern
          continue;
        }

        // For risky/unknown — continue but keep as fallback
      } catch (error) {
        this.logger.warn({
          msg: 'Verification error, skipping pattern',
          domain,
          pattern: patternsChecked,
          error: (error as Error).message,
        });
        // Continue to next pattern on error
      }
    }

    // 5. Hunter.io fallback — only if Reacher found nothing and Hunter is available
    if (this.hunterAdapter) {
      const hunterAvailable = await this.hunterAdapter.isAvailable();
      if (hunterAvailable) {
        const hunterResult = await this.tryHunterFallback(firstName, lastName, domain, segment, patternsChecked);
        if (hunterResult) return hunterResult;
      }
    }

    // 6. No valid email found anywhere
    this.logger.log({ msg: 'No email found', domain, patternsChecked });
    return { email: null, confidence: 0, source: 'not_found', patternsChecked, domain };
  }

  private async tryHunterFallback(
    firstName: string,
    lastName: string,
    domain: string,
    segment: string | undefined,
    patternsChecked: number,
  ): Promise<EmailFinderResult | null> {
    const hasName = Boolean(firstName && lastName);

    if (hasName) {
      // Try email-finder with known name
      const result = await this.hunterAdapter!.emailFinder(domain, firstName, lastName);
      if (result?.email) {
        this.logger.log({ msg: 'Email found via Hunter emailFinder', domain });
        return {
          email: result.email,
          confidence: result.score,
          source: 'hunter_finder',
          patternsChecked,
          domain,
        };
      }
    }

    // No name or name lookup failed — try domain search and pick best contact
    if (this.decideurSelectionService && segment) {
      const department = this.decideurSelectionService.getDepartmentForSegment(segment);
      const contacts = await this.hunterAdapter!.domainSearch(domain, undefined, department);
      if (contacts.length > 0) {
        const ranking = this.decideurSelectionService.selectBestDecideur(contacts, segment);
        const primary = ranking?.primary;
        if (primary?.email) {
          this.logger.log({ msg: 'Email found via Hunter domainSearch', domain, score: primary.decideur_score });
          return {
            email: primary.email,
            confidence: primary.confidence,
            source: 'hunter_domain_search',
            patternsChecked,
            domain,
          };
        }
      }
    }

    return null;
  }
}
