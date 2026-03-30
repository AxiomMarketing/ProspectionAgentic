import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LinkedInSignal } from './linkedin-signal.interface';

interface NetrowsCompany {
  name?: string;
  linkedin_url?: string;
  headcount?: number;
  headcount_change_pct?: number;
  changed_at?: string;
}

interface NetrowsResponse {
  data?: NetrowsCompany[];
}

@Injectable()
export class NetrowsAdapter {
  private readonly logger = new Logger(NetrowsAdapter.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getJobChanges(since: Date): Promise<LinkedInSignal[]> {
    const apiKey = this.configService.get<string>('NETROWS_API_KEY');
    const apiUrl = this.configService.get<string>('NETROWS_API_URL', 'https://api.netrows.io');

    if (!apiKey) {
      this.logger.warn({ msg: 'NETROWS_API_KEY not configured, skipping job changes fetch' });
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<NetrowsResponse>(`${apiUrl}/api/v1/companies`, {
          params: { changed_since: since.toISOString(), signal_type: 'job_change' },
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          timeout: 15_000,
        }),
      );

      const companies = response.data?.data ?? [];
      return companies.map((c): LinkedInSignal => ({
        type: 'job_change',
        companyName: c.name ?? 'Inconnu',
        companyLinkedinUrl: c.linkedin_url,
        detail: `Changements de postes détectés`,
        score: 20,
        detectedAt: c.changed_at ? new Date(c.changed_at) : new Date(),
      }));
    } catch (error) {
      this.logger.error({ msg: 'Netrows getJobChanges failed', error: (error as Error).message });
      return [];
    }
  }

  async getHeadcountChanges(companyIds: string[]): Promise<LinkedInSignal[]> {
    const apiKey = this.configService.get<string>('NETROWS_API_KEY');
    const apiUrl = this.configService.get<string>('NETROWS_API_URL', 'https://api.netrows.io');

    if (!apiKey) {
      this.logger.warn({ msg: 'NETROWS_API_KEY not configured, skipping headcount changes fetch' });
      return [];
    }

    if (companyIds.length === 0) return [];

    try {
      const response = await firstValueFrom(
        this.httpService.get<NetrowsResponse>(`${apiUrl}/api/v1/companies`, {
          params: { company_ids: companyIds.join(','), signal_type: 'headcount' },
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          timeout: 15_000,
        }),
      );

      const companies = response.data?.data ?? [];
      return companies
        .filter((c) => c.headcount_change_pct && Math.abs(c.headcount_change_pct) >= 5)
        .map((c): LinkedInSignal => {
          const pct = c.headcount_change_pct ?? 0;
          const direction = pct > 0 ? 'croissance' : 'réduction';
          return {
            type: 'headcount_change',
            companyName: c.name ?? 'Inconnu',
            companyLinkedinUrl: c.linkedin_url,
            detail: `Effectif: ${direction} de ${Math.abs(pct)}%`,
            score: Math.abs(pct) >= 20 ? 25 : 15,
            detectedAt: new Date(),
          };
        });
    } catch (error) {
      this.logger.error({ msg: 'Netrows getHeadcountChanges failed', error: (error as Error).message });
      return [];
    }
  }
}
