import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  IMarketDataAdapter,
  FetchOpportunitiesRequest,
  MarketOpportunity,
} from '@common/ports/i-market-data.adapter';
import { validateExternalUrl } from '@common/utils/url-validator';

/**
 * BOAMP uses Opendatasoft API (v2.1).
 * Docs: https://boamp-datadila.opendatasoft.com/api/explore/v2.1/
 * Dataset: "boamp"
 */
interface BoampRecord {
  idweb?: string;
  objet?: string;
  nomacheteur?: string;
  dateparution?: string;
  datelimitereponse?: string;
  descripteur_libelle?: string;
  descripteur_code?: string;
  url_avis?: string;
  type_marche?: string;
  nature?: string;
  donnees?: string; // JSON string with detailed data
}

interface OpendatasoftResponse {
  total_count: number;
  results: BoampRecord[];
}

@Injectable()
export class BoampAdapter extends IMarketDataAdapter {
  private readonly logger = new Logger(BoampAdapter.name);
  private readonly baseUrl =
    'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
    validateExternalUrl(this.baseUrl);
  }

  async fetchRecentOpportunities(request: FetchOpportunitiesRequest): Promise<MarketOpportunity[]> {
    const isoSince = request.since.toISOString().split('T')[0];
    const keywordsWhere = request.keywords
      .map((k) => `search(objet, "${k}")`)
      .join(' OR ');
    const where = `dateparution >= "${isoSince}" AND (${keywordsWhere})`;

    this.logger.log({
      msg: 'Fetching BOAMP opportunities',
      keywords: request.keywords,
      since: isoSince,
      maxResults: request.maxResults,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get<OpendatasoftResponse>(this.baseUrl, {
          params: {
            where,
            limit: request.maxResults ?? 50,
            order_by: 'dateparution DESC',
          },
          headers: {
            'User-Agent': 'AxiomProspection/1.0',
            Accept: 'application/json',
          },
          timeout: 15_000,
        }),
      );

      const results = response.data?.results ?? [];
      const mapped = results.map((item) => this.mapToOpportunity(item, request.keywords));

      this.logger.log({
        msg: 'BOAMP fetch complete',
        totalResults: response.data?.total_count ?? 0,
        returned: results.length,
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
        this.httpService.get(this.baseUrl, {
          params: { limit: 1 },
          timeout: 5_000,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private mapToOpportunity(item: BoampRecord, keywords: string[]): MarketOpportunity {
    const text = `${item.objet ?? ''} ${item.descripteur_libelle ?? ''}`.toLowerCase();
    const matchCount = keywords.filter((k) => text.includes(k.toLowerCase())).length;
    const relevanceScore =
      keywords.length > 0 ? Math.min(100, Math.round((matchCount / keywords.length) * 100)) : 0;

    return {
      url: item.url_avis ?? `https://www.boamp.fr/avis/detail/${item.idweb}`,
      companyName: item.nomacheteur ?? 'Inconnu',
      title: item.objet ?? '',
      description: item.descripteur_libelle ?? '',
      publishedAt: item.dateparution ? new Date(item.dateparution) : new Date(),
      deadline: item.datelimitereponse ? new Date(item.datelimitereponse) : undefined,
      estimatedValue: undefined, // Not directly available in top-level fields
      cpvCodes: item.descripteur_code ? [item.descripteur_code] : [],
      relevanceScore,
      raw: item as unknown as Record<string, unknown>,
    };
  }
}
