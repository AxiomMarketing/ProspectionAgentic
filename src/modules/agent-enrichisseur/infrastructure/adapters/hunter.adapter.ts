import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface HunterContact {
  email: string;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  linkedin_url: string | null;
}

export interface HunterEmailResult {
  email: string;
  score: number;
  position: string | null;
  linkedin_url: string | null;
}

export interface HunterVerifyResult {
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
  score: number;
}

@Injectable()
export class HunterAdapter {
  private readonly logger = new Logger(HunterAdapter.name);
  private readonly baseUrl = 'https://api.hunter.io/v2/';
  private readonly timeoutMs = 15_000;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('HUNTER_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('HUNTER_API_KEY is not set — Hunter.io adapter will be disabled');
    }
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async domainSearch(
    domain: string,
    seniority?: string,
    department?: string,
    limit = 10,
  ): Promise<HunterContact[]> {
    if (!this.apiKey) return [];

    const params: Record<string, string | number> = {
      domain,
      type: 'personal',
      limit,
      api_key: this.apiKey,
    };
    if (seniority) params.seniority = seniority;
    if (department) params.department = department;

    try {
      const response = await firstValueFrom(
        this.httpService.get<HunterDomainSearchResponse>(
          `${this.baseUrl}domain-search`,
          { params, timeout: this.timeoutMs },
        ),
      );
      return (response.data.data?.emails ?? []).map(this.mapContact);
    } catch (error) {
      return this.handleError<HunterContact[]>(error, []);
    }
  }

  async emailFinder(
    domain: string,
    firstName: string,
    lastName: string,
  ): Promise<HunterEmailResult | null> {
    if (!this.apiKey) return null;

    const params = {
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: this.apiKey,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get<HunterEmailFinderResponse>(
          `${this.baseUrl}email-finder`,
          { params, timeout: this.timeoutMs },
        ),
      );
      const d = response.data.data;
      if (!d?.email) return null;
      return {
        email: d.email,
        score: d.score ?? 0,
        position: d.position ?? null,
        linkedin_url: d.linkedin_url ?? null,
      };
    } catch (error) {
      return this.handleError<HunterEmailResult | null>(error, null);
    }
  }

  async emailVerifier(email: string): Promise<HunterVerifyResult> {
    if (!this.apiKey) {
      return { status: 'unknown', score: 0 };
    }

    const params = { email, api_key: this.apiKey };

    try {
      const response = await firstValueFrom(
        this.httpService.get<HunterVerifyResponse>(
          `${this.baseUrl}email-verifier`,
          { params, timeout: this.timeoutMs },
        ),
      );
      const d = response.data.data;
      return {
        status: d?.status ?? 'unknown',
        score: d?.score ?? 0,
      };
    } catch (error) {
      return this.handleError<HunterVerifyResult>(error, { status: 'unknown', score: 0 });
    }
  }

  async getCreditsRemaining(): Promise<number> {
    if (!this.apiKey) return 0;

    const params = { api_key: this.apiKey };

    try {
      const response = await firstValueFrom(
        this.httpService.get<HunterAccountResponse>(
          `${this.baseUrl}account`,
          { params, timeout: this.timeoutMs },
        ),
      );
      return response.data.data?.calls?.available ?? 0;
    } catch (error) {
      return this.handleError<number>(error, 0);
    }
  }

  private mapContact = (raw: HunterRawContact): HunterContact => ({
    email: raw.value,
    confidence: raw.confidence ?? 0,
    first_name: raw.first_name ?? null,
    last_name: raw.last_name ?? null,
    position: raw.position ?? null,
    seniority: raw.seniority ?? null,
    department: raw.department ?? null,
    linkedin_url: raw.linkedin ?? null,
  });

  private handleError<T>(error: unknown, fallback: T): T {
    const status = (error as any)?.response?.status;
    if (status === 429) {
      this.logger.warn({ msg: 'Hunter.io rate limit hit (429), returning fallback' });
    } else {
      this.logger.warn({ msg: 'Hunter.io request failed', error: (error as Error).message });
    }
    return fallback;
  }
}

// Internal API response types
interface HunterRawContact {
  value: string;
  confidence?: number;
  first_name?: string;
  last_name?: string;
  position?: string;
  seniority?: string;
  department?: string;
  linkedin?: string;
}

interface HunterDomainSearchResponse {
  data: { emails: HunterRawContact[] };
}

interface HunterEmailFinderResponse {
  data: {
    email: string | null;
    score?: number;
    position?: string;
    linkedin_url?: string;
  };
}

interface HunterVerifyResponse {
  data: {
    status: HunterVerifyResult['status'];
    score?: number;
  };
}

interface HunterAccountResponse {
  data: {
    calls: { available: number };
  };
}
