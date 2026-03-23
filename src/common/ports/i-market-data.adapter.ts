export interface FetchOpportunitiesRequest {
  source: string;
  since: Date;
  keywords: string[];
  maxResults?: number;
}

export interface MarketOpportunity {
  url: string;
  companyName: string;
  title: string;
  description: string;
  publishedAt: Date;
  deadline?: Date;
  estimatedValue?: number;
  cpvCodes?: string[];
  relevanceScore: number;
  raw: Record<string, unknown>;
}

export abstract class IMarketDataAdapter {
  abstract fetchRecentOpportunities(
    request: FetchOpportunitiesRequest,
  ): Promise<MarketOpportunity[]>;
  abstract isAvailable(): Promise<boolean>;
}
