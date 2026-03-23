import { Injectable, Logger } from '@nestjs/common';
import {
  IMarketDataAdapter,
  FetchOpportunitiesRequest,
  MarketOpportunity,
} from '@common/ports/i-market-data.adapter';

@Injectable()
export class StubMarketDataAdapter extends IMarketDataAdapter {
  private readonly logger = new Logger(StubMarketDataAdapter.name);

  async fetchRecentOpportunities(
    _request: FetchOpportunitiesRequest,
  ): Promise<MarketOpportunity[]> {
    this.logger.warn('StubMarketDataAdapter: market data not configured — returning empty array');
    return [];
  }

  async isAvailable(): Promise<boolean> {
    this.logger.warn('StubMarketDataAdapter: market data not available — stub adapter in use');
    return false;
  }
}
