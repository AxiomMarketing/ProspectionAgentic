import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { IEmailVerifierAdapter, EmailVerificationResult } from '@common/ports/i-email-verifier.adapter';
import { validateEmailDomain } from '@common/utils/url-validator';

@Injectable()
export class ReacherAdapter extends IEmailVerifierAdapter {
  private readonly logger = new Logger(ReacherAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;
  private activeCalls = 0;

  // Circuit breaker state
  private failureCount = 0;
  private circuitOpen = false;
  private circuitOpenedAt = 0;
  private readonly failureThreshold = 5;
  private readonly resetTimeoutMs = 60_000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.baseUrl = this.configService.get<string>('enrichment.reacherUrl', 'http://localhost:8080');
    this.timeoutMs = this.configService.get<number>('enrichment.reacherTimeoutMs', 30000);
    this.maxConcurrent = this.configService.get<number>('enrichment.reacherMaxConcurrent', 5);
  }

  async verify(email: string): Promise<EmailVerificationResult> {
    // Validate email domain (SSRF prevention)
    const domain = email.split('@')[1];
    if (domain) validateEmailDomain(domain);

    // Circuit breaker check
    if (this.isCircuitOpen()) {
      return this.unknownResult(email);
    }

    // Throttling
    while (this.activeCalls >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    this.activeCalls++;
    try {
      const response = await firstValueFrom(
        this.httpService.post<ReacherResponse>(
          `${this.baseUrl}/v0/check_email`,
          { to_email: email },
          { timeout: this.timeoutMs, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      this.onSuccess();
      return this.mapResponse(email, response.data);
    } catch (error) {
      this.onFailure();
      this.logger.warn({ msg: 'Reacher verification failed', domain: email.split('@')[1], error: (error as Error).message });
      return this.unknownResult(email);
    } finally {
      this.activeCalls--;
    }
  }

  async verifyBatch(emails: string[]): Promise<EmailVerificationResult[]> {
    const results: EmailVerificationResult[] = [];
    // Process in chunks of maxConcurrent
    for (let i = 0; i < emails.length; i += this.maxConcurrent) {
      const chunk = emails.slice(i, i + this.maxConcurrent);
      const chunkResults = await Promise.all(chunk.map(email => this.verify(email)));
      results.push(...chunkResults);
    }
    return results;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await firstValueFrom(this.httpService.get(this.baseUrl, { timeout: 5000 }));
      return true;
    } catch {
      return false;
    }
  }

  // Map Reacher API response to our interface
  private mapResponse(email: string, data: ReacherResponse): EmailVerificationResult {
    const isDeliverable = data.smtp?.is_deliverable === true;
    const isCatchAll = data.smtp?.is_catch_all === true;
    const confidence = this.calculateConfidence(data.is_reachable, isCatchAll);

    return {
      email,
      isReachable: data.is_reachable as EmailVerificationResult['isReachable'],
      isDeliverable,
      isCatchAll,
      isDisposable: data.misc?.is_disposable === true,
      isRoleAccount: data.misc?.is_role_account === true,
      mxRecords: data.mx?.records?.map((r: any) => r.exchange || r) ?? [],
      smtpCanConnect: data.smtp?.can_connect_smtp === true,
      confidence,
    };
  }

  private calculateConfidence(reachable: string, isCatchAll: boolean): number {
    if (reachable === 'safe' && !isCatchAll) return 99;
    if (reachable === 'safe' && isCatchAll) return 60;
    if (reachable === 'risky') return 40;
    if (reachable === 'unknown') return 20;
    return 0; // invalid
  }

  private unknownResult(email: string): EmailVerificationResult {
    return { email, isReachable: 'unknown', isDeliverable: false, isCatchAll: false, isDisposable: false, isRoleAccount: false, mxRecords: [], smtpCanConnect: false, confidence: 0 };
  }

  // Circuit breaker
  private isCircuitOpen(): boolean {
    if (!this.circuitOpen) return false;
    if (Date.now() - this.circuitOpenedAt > this.resetTimeoutMs) {
      this.circuitOpen = false; // half-open
      this.failureCount = 0;
      return false;
    }
    return true;
  }

  private onSuccess(): void {
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpen = true;
      this.circuitOpenedAt = Date.now();
      this.logger.error({ msg: 'Circuit breaker OPEN for Reacher', failures: this.failureCount });
    }
  }
}

// Reacher API response types
interface ReacherResponse {
  input: string;
  is_reachable: string;
  misc: { is_disposable: boolean; is_role_account: boolean };
  mx: { accepts_mail: boolean; records: Array<{ exchange: string; priority: number }> };
  smtp: { can_connect_smtp: boolean; is_deliverable: boolean; is_catch_all: boolean };
  syntax: { is_valid_syntax: boolean };
}
