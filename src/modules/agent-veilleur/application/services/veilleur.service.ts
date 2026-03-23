import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { IMarketDataAdapter } from '@common/ports/i-market-data.adapter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { DetectLeadDto } from '../dtos/detect-lead.dto';

@Injectable()
export class VeilleurService {
  private readonly logger = new Logger(VeilleurService.name);

  constructor(
    private readonly rawLeadRepository: IRawLeadRepository,
    private readonly marketDataAdapter: IMarketDataAdapter,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async detectLeads(dto: DetectLeadDto): Promise<RawLead[]> {
    this.logger.log({ msg: 'Starting lead detection', source: dto.source, keywords: dto.keywords });

    const opportunities = await this.marketDataAdapter.fetchRecentOpportunities({
      source: dto.source,
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      keywords: dto.keywords,
      maxResults: dto.maxResults,
    });

    const leads: RawLead[] = [];
    for (const opp of opportunities) {
      const existing = await this.rawLeadRepository.findBySourceUrl(opp.url);
      if (existing) continue;

      const lead = RawLead.create({
        source: dto.source,
        sourceId: opp.url,
        sourceUrl: opp.url,
        rawData: opp.raw,
      });

      const saved = await this.rawLeadRepository.save(lead);
      leads.push(saved);
      this.eventEmitter.emit('lead.detected', { leadId: saved.id, source: dto.source });
    }

    this.logger.log({ msg: 'Lead detection complete', count: leads.length });
    return leads;
  }

  async getPendingLeads(limit?: number): Promise<RawLead[]> {
    return this.rawLeadRepository.findPending(limit);
  }
}
