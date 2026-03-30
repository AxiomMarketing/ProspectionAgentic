import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LinkedInSignal } from './linkedin-signal.interface';

interface SignalsApiJobPosting {
  company_name?: string;
  company_linkedin_url?: string;
  job_count?: number;
  velocity_pct?: number;
  posted_at?: string;
}

interface SignalsApiResponse {
  results?: SignalsApiJobPosting[];
}

@Injectable()
export class SignalsApiAdapter {
  private readonly logger = new Logger(SignalsApiAdapter.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getHiringSignals(keywords: string[]): Promise<LinkedInSignal[]> {
    const apiKey = this.configService.get<string>('SIGNALSAPI_KEY');
    const baseUrl = this.configService.get<string>('SIGNALSAPI_BASE_URL', 'https://api.signalsapi.io');

    if (!apiKey) {
      this.logger.warn({ msg: 'SIGNALSAPI_KEY not configured, skipping hiring signals fetch' });
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<SignalsApiResponse>(`${baseUrl}/v1/jobs`, {
          params: { keywords: keywords.join(','), limit: 100 },
          headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
          timeout: 15_000,
        }),
      );

      const results = response.data?.results ?? [];
      const signals: LinkedInSignal[] = [];

      for (const item of results) {
        const jobCount = item.job_count ?? 0;
        const velocityPct = item.velocity_pct ?? 0;
        const companyName = item.company_name ?? 'Inconnu';

        // Hiring signal based on job count
        if (jobCount > 0) {
          const hiringScore = jobCount >= 20 ? 25 : jobCount >= 10 ? 20 : 15;
          signals.push({
            type: 'hiring',
            companyName,
            companyLinkedinUrl: item.company_linkedin_url,
            detail: `${jobCount} offre(s) d'emploi détectée(s) pour: ${keywords.join(', ')}`,
            score: hiringScore,
            detectedAt: item.posted_at ? new Date(item.posted_at) : new Date(),
          });
        }

        // Hiring velocity signal
        if (velocityPct >= 20) {
          signals.push({
            type: 'hiring_velocity',
            companyName,
            companyLinkedinUrl: item.company_linkedin_url,
            detail: `Accélération recrutement: +${velocityPct}% vs mois précédent`,
            score: velocityPct >= 50 ? 25 : 20,
            detectedAt: item.posted_at ? new Date(item.posted_at) : new Date(),
          });
        }
      }

      this.logger.log({ msg: 'SignalsAPI hiring signals fetched', count: signals.length });
      return signals;
    } catch (error) {
      this.logger.error({ msg: 'SignalsAPI getHiringSignals failed', error: (error as Error).message });
      return [];
    }
  }
}
