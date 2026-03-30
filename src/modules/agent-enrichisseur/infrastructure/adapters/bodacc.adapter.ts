import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ILegalNoticesAdapter, LegalNotice } from '@common/ports/i-legal-notices.adapter';
import { validateExternalUrl } from '@common/utils/url-validator';
import { EnrichmentCacheService, CACHE_TTL } from '../services/enrichment-cache.service';

interface BodaccRecord {
  id: string;
  typeavis?: string;
  familleavis?: string;
  registre?: string;
  tribunal?: string;
  denomination?: string;
  dateparution?: string;
  contenu?: string;
  [key: string]: unknown;
}

@Injectable()
export class BodaccAdapter extends ILegalNoticesAdapter {
  private readonly logger = new Logger(BodaccAdapter.name);
  private readonly baseUrl = 'https://bodacc-datadila.opendatasoft.com/api/v2/catalog/datasets/annonces-commerciales/records';

  constructor(
    private readonly httpService: HttpService,
    private readonly cache: EnrichmentCacheService,
  ) {
    super();
    validateExternalUrl(this.baseUrl);
  }

  async getNoticesBySiren(siren: string): Promise<LegalNotice[]> {
    const normalizedSiren = this.normalizeSiren(siren);

    const cacheKey = `enrichment:bodacc:${normalizedSiren}`;
    const cached = await this.cache.get<LegalNotice[]>(cacheKey);
    if (cached) return cached;

    const where = `registre like "${normalizedSiren}"`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ results: Array<{ record: { fields: BodaccRecord } }> }>(
          this.baseUrl,
          { params: { where, limit: 50, order_by: 'dateparution DESC' }, timeout: 15_000 }
        ),
      );
      const records = response.data?.results ?? [];
      const notices = this.deduplicateNotices(records.map(r => this.mapToNotice(r.record.fields)));
      await this.cache.set(cacheKey, notices, CACHE_TTL.BODACC);
      return notices;
    } catch (error) {
      this.logger.error({ msg: 'BODACC fetch failed', siren: normalizedSiren, error: (error as Error).message });
      throw error;
    }
  }

  async getRecentCreations(since: Date, departement?: string): Promise<LegalNotice[]> {
    const dateSince = since.toISOString().split('T')[0];
    let where = `dateparution >= "${dateSince}" AND familleavis = "creation"`;
    if (departement) where += ` AND numerodepartement = "${departement}"`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ results: Array<{ record: { fields: BodaccRecord } }> }>(
          this.baseUrl,
          { params: { where, limit: 100, order_by: 'dateparution DESC' }, timeout: 15_000 }
        ),
      );
      return (response.data?.results ?? []).map(r => this.mapToNotice(r.record.fields));
    } catch (error) {
      this.logger.error({ msg: 'BODACC creations fetch failed', error: (error as Error).message });
      throw error;
    }
  }

  async hasCollectiveProcedure(siren: string): Promise<boolean> {
    try {
      const notices = await this.getNoticesBySiren(siren);
      return notices.some(n => n.type === 'procedure_collective');
    } catch { return false; }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await firstValueFrom(this.httpService.get(this.baseUrl, { params: { limit: 1 }, timeout: 5_000 }));
      return true;
    } catch { return false; }
  }

  private normalizeSiren(siren: string): string {
    return siren.replace(/[\s\-.]/g, '').replace(/[^0-9]/g, '').slice(0, 9);
  }

  private mapToNotice(fields: BodaccRecord): LegalNotice {
    return {
      id: fields.id ?? `bodacc-${Date.now()}`,
      type: this.mapNoticeType(fields.familleavis ?? '', fields.typeavis ?? ''),
      publicationDate: fields.dateparution ? new Date(fields.dateparution) : new Date(),
      tribunal: fields.tribunal ?? 'Inconnu',
      content: fields.contenu ?? '',
      registre: fields.registre ?? '',
      denomination: fields.denomination,
    };
  }

  private mapNoticeType(famille: string, type: string): LegalNotice['type'] {
    const lower = `${famille} ${type}`.toLowerCase();
    if (lower.includes('creation') || lower.includes('immatriculation')) return 'creation';
    if (lower.includes('collective') || lower.includes('redressement') || lower.includes('liquidation') || lower.includes('sauvegarde')) return 'procedure_collective';
    if (lower.includes('cession') || lower.includes('vente')) return 'cession';
    if (lower.includes('radiation')) return 'radiation';
    return 'modification';
  }

  private deduplicateNotices(notices: LegalNotice[]): LegalNotice[] {
    const seen = new Set<string>();
    return notices.filter(n => {
      const key = `${n.id}-${n.registre}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
