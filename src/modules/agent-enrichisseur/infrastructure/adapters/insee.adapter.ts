import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { validateExternalUrl } from '@common/utils/url-validator';
import { EnrichmentCacheService, CACHE_TTL } from '../services/enrichment-cache.service';

const INSEE_TRANCHES: Record<string, string> = {
  '00': '0 salarié',
  '01': '1-2',
  '02': '3-5',
  '03': '6-9',
  '11': '10-19',
  '12': '20-49',
  '21': '50-99',
  '22': '100-199',
  '31': '200-249',
  '32': '250-499',
  '41': '500-999',
  '42': '1000-1999',
  '51': '2000-4999',
  '52': '5000-9999',
  '53': '10000+',
};

export interface InseeCompanyData {
  siren: string;
  siret?: string;
  legalName: string;
  tradeName?: string;
  nafCode?: string;
  nafLabel?: string;
  legalCategory?: string;
  creationDate?: string;
  address?: {
    street?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
  employeeRange?: string;
  isActive: boolean;
}

@Injectable()
export class InseeAdapter {
  private readonly logger = new Logger(InseeAdapter.name);
  private readonly baseUrl = 'https://api.insee.fr/api-sirene/3.11';
  private readonly token: string | null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly cache: EnrichmentCacheService,
  ) {
    this.token = this.configService.get<string>('SIRENE_API_TOKEN', '') || null;
    if (!this.token) {
      this.logger.warn('SIRENE_API_TOKEN not set — INSEE adapter unavailable');
    }
    validateExternalUrl(this.baseUrl);
  }

  async searchBySiren(siren: string): Promise<InseeCompanyData | null> {
    if (!this.token) return null;

    const cacheKey = `enrichment:insee:${siren}`;
    const cached = await this.cache.get<InseeCompanyData>(cacheKey);
    if (cached) return cached;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/siren/${siren}`, {
          headers: {
            'X-Insee-Api-Key-Integration': this.token!,
            Accept: 'application/json',
          },
          timeout: 10_000,
        }),
      );

      const unit = response.data?.uniteLegale;
      if (!unit) return null;

      const periodeUniteLegale = unit.periodesUniteLegale?.[0];

      const result: InseeCompanyData = {
        siren: unit.siren,
        legalName: periodeUniteLegale?.denominationUniteLegale ?? '',
        tradeName: periodeUniteLegale?.denominationUsuelle1UniteLegale ?? undefined,
        nafCode: periodeUniteLegale?.activitePrincipaleUniteLegale ?? undefined,
        legalCategory: periodeUniteLegale?.categorieJuridiqueUniteLegale ?? undefined,
        creationDate: unit.dateCreationUniteLegale ?? undefined,
        employeeRange: this.resolveTrancheLabel(periodeUniteLegale?.trancheEffectifsUniteLegale),
        isActive: periodeUniteLegale?.etatAdministratifUniteLegale === 'A',
      };

      await this.cache.set(cacheKey, result, CACHE_TTL.INSEE);
      return result;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        this.logger.debug({ msg: 'SIREN not found', siren });
        return null;
      }
      this.logger.error({ msg: 'INSEE API error', siren, error: error.message });
      return null;
    }
  }

  async searchByName(name: string, limit = 5): Promise<InseeCompanyData[]> {
    if (!this.token) return [];

    try {
      const query = encodeURIComponent(`denominationUniteLegale:"${name}"`);
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/siren?q=${query}&nombre=${limit}`, {
          headers: {
            'X-Insee-Api-Key-Integration': this.token!,
            Accept: 'application/json',
          },
          timeout: 10_000,
        }),
      );

      const units = response.data?.unitesLegales ?? [];
      return units.map((unit: any) => {
        const periode = unit.periodesUniteLegale?.[0];
        return {
          siren: unit.siren,
          legalName: periode?.denominationUniteLegale ?? '',
          nafCode: periode?.activitePrincipaleUniteLegale ?? undefined,
          creationDate: unit.dateCreationUniteLegale ?? undefined,
          employeeRange: this.resolveTrancheLabel(periode?.trancheEffectifsUniteLegale),
          isActive: periode?.etatAdministratifUniteLegale === 'A',
        };
      });
    } catch (error: any) {
      this.logger.error({ msg: 'INSEE search failed', name, error: error.message });
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.token) return false;
    try {
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/informations`, {
          headers: { 'X-Insee-Api-Key-Integration': this.token! },
          timeout: 5_000,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private resolveTrancheLabel(code: string | undefined): string | undefined {
    if (!code) return undefined;
    return INSEE_TRANCHES[code] ?? code;
  }
}
