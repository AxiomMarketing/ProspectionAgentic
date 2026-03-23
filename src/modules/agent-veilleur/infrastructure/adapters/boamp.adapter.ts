import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  IMarketDataAdapter,
  FetchOpportunitiesRequest,
  MarketOpportunity,
} from '@common/ports/i-market-data.adapter';

interface BoampAvisItem {
  idWeb: string;
  acheteur?: { nom?: string };
  objet: string;
  descriptif?: string;
  dateParution: string;
  dateLimite?: string;
  valeurEstimee?: number;
  cpv?: Array<{ code: string }>;
  url?: string;
}

@Injectable()
export class BoampAdapter extends IMarketDataAdapter {
  private readonly logger = new Logger(BoampAdapter.name);
  private readonly baseUrl = 'https://www.boamp.fr/api/avis';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async fetchRecentOpportunities(request: FetchOpportunitiesRequest): Promise<MarketOpportunity[]> {
    const isoSince = request.since.toISOString().split('T')[0];
    const keywordsQuery = request.keywords.join(' OR ');

    const params = new URLSearchParams({
      q: keywordsQuery,
      date_parution_min: isoSince,
      rows: String(request.maxResults ?? 50),
    });

    this.logger.log({
      msg: 'Fetching BOAMP opportunities',
      keywords: request.keywords,
      since: isoSince,
      maxResults: request.maxResults,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ results: BoampAvisItem[] }>(
          `${this.baseUrl}/search?${params.toString()}`,
          {
            headers: {
              'User-Agent': 'AxiomProspection/1.0',
              Accept: 'application/json',
            },
            timeout: 15_000,
          },
        ),
      );

      const results = response.data?.results ?? [];
      const mapped = results.map((item) => this.mapToOpportunity(item, request.keywords));

      this.logger.log({
        msg: 'BOAMP fetch complete',
        totalResults: results.length,
        mapped: mapped.length,
      });

      return mapped;
    } catch (error) {
      this.logger.error({
        msg: 'BOAMP API call failed',
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/search?rows=1`, {
          timeout: 5_000,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private mapToOpportunity(item: BoampAvisItem, keywords: string[]): MarketOpportunity {
    const text = `${item.objet ?? ''} ${item.descriptif ?? ''}`.toLowerCase();
    const matchCount = keywords.filter((k) => text.includes(k.toLowerCase())).length;
    const relevanceScore =
      keywords.length > 0 ? Math.min(100, Math.round((matchCount / keywords.length) * 100)) : 0;

    return {
      url: item.url ?? `https://www.boamp.fr/avis/${item.idWeb}`,
      companyName: item.acheteur?.nom ?? 'Inconnu',
      title: item.objet,
      description: item.descriptif ?? '',
      publishedAt: new Date(item.dateParution),
      deadline: item.dateLimite ? new Date(item.dateLimite) : undefined,
      estimatedValue: item.valeurEstimee,
      cpvCodes: item.cpv?.map((c) => c.code) ?? [],
      relevanceScore,
      raw: item as unknown as Record<string, unknown>,
    };
  }
}
