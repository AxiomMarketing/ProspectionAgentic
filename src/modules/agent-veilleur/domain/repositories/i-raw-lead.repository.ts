import { RawLead } from '../entities/raw-lead.entity';

export abstract class IRawLeadRepository {
  abstract findById(id: string): Promise<RawLead | null>;
  abstract findBySourceUrl(sourceUrl: string): Promise<RawLead | null>;
  abstract findPending(limit?: number): Promise<RawLead[]>;
  abstract save(lead: RawLead): Promise<RawLead>;
  abstract update(lead: RawLead): Promise<RawLead>;
  abstract countBySourceSince(source: string, since: Date): Promise<number>;
  abstract findBySourceUrls(urls: string[]): Promise<RawLead[]>;
}
