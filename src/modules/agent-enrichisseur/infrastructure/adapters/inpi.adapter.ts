import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  ICompanyRegistryAdapter,
  CompanyRegistryData,
  CompanyDirector,
  CompanyFinancials,
} from '@common/ports/i-company-registry.adapter';
import { validateExternalUrl } from '@common/utils/url-validator';
import { EnrichmentCacheService, CACHE_TTL } from '../services/enrichment-cache.service';

@Injectable()
export class InpiAdapter extends ICompanyRegistryAdapter {
  private readonly logger = new Logger(InpiAdapter.name);
  private readonly apiUrl: string;
  private readonly username: string | null;
  private readonly password: string | null;
  private authToken: string | null = null;
  private tokenExpiresAt = 0;

  // Circuit breaker
  private failureCount = 0;
  private circuitOpen = false;
  private circuitOpenedAt = 0;
  private readonly failureThreshold = 5;
  private readonly resetTimeoutMs = 300_000; // 5 minutes for INPI

  // Rate limiting: max 5 req/min
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerMinute = 5;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly cache: EnrichmentCacheService,
  ) {
    super();
    this.apiUrl = this.configService.get<string>('enrichment.inpiApiUrl', 'https://data.inpi.fr/api');
    this.username = this.configService.get<string>('enrichment.inpiUsername') || null;
    this.password = this.configService.get<string>('enrichment.inpiPassword') || null;
    if (!this.username) {
      this.logger.warn('INPI credentials not configured — company registry features disabled');
    }
    validateExternalUrl(this.apiUrl);
  }

  async getBySiren(siren: string): Promise<CompanyRegistryData | null> {
    if (!this.username || this.isCircuitOpen()) return null;

    const cacheKey = `enrichment:inpi:${siren}`;
    const cached = await this.cache.get<CompanyRegistryData>(cacheKey);
    if (cached) return cached;

    if (!this.checkRateLimit()) {
      this.logger.warn({ msg: 'INPI rate limit reached', siren });
      return null;
    }
    try {
      await this.ensureAuth();
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/companies/${siren}`, {
          headers: { Authorization: `Bearer ${this.authToken}` },
          timeout: 10_000,
        }),
      );
      this.onSuccess();
      const result = this.mapCompanyData(siren, response.data);
      await this.cache.set(cacheKey, result, CACHE_TTL.INPI);
      return result;
    } catch (error) {
      this.onFailure();
      this.logger.warn({ msg: 'INPI fetch failed', siren, error: (error as Error).message });
      return null;
    }
  }

  async getDirectors(siren: string): Promise<CompanyDirector[]> {
    const data = await this.getBySiren(siren);
    return data?.directors ?? [];
  }

  async getFinancials(siren: string): Promise<CompanyFinancials[]> {
    const data = await this.getBySiren(siren);
    return data?.financials ?? [];
  }

  async isAvailable(): Promise<boolean> {
    if (!this.username) return false;
    try {
      await this.ensureAuth();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureAuth(): Promise<void> {
    if (this.authToken && Date.now() < this.tokenExpiresAt) return;
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiUrl}/auth/login`,
        { username: this.username, password: this.password },
        { timeout: 10_000 },
      ),
    );
    this.authToken = response.data?.token ?? response.data?.access_token;
    this.tokenExpiresAt = Date.now() + 3_600_000; // assume 1h validity
  }

  private mapCompanyData(siren: string, data: any): CompanyRegistryData {
    const isConfidential = data.confidential === true || data.confidentiel === true;
    if (isConfidential) {
      this.logger.warn({ msg: 'INPI confidential account — financials suppressed', siren });
    }

    const directors: CompanyDirector[] = (data.dirigeants ?? data.representatives ?? []).map(
      (d: any) => ({
        firstName: d.prenom ?? d.firstName ?? '',
        lastName: d.nom ?? d.lastName ?? '',
        role: d.qualite ?? d.role ?? 'Dirigeant',
        birthDate: d.dateNaissance ?? d.birthDate,
        nationality: d.nationalite ?? d.nationality,
      }),
    );

    const beneficialOwners: CompanyDirector[] = (
      data.beneficiairesEffectifs ??
      data.beneficialOwners ??
      []
    ).map((b: any) => ({
      firstName: b.prenom ?? b.firstName ?? '',
      lastName: b.nom ?? b.lastName ?? '',
      role: 'Bénéficiaire effectif',
      birthDate: b.dateNaissance ?? b.birthDate,
      nationality: b.nationalite ?? b.nationality,
    }));

    const financials: CompanyFinancials[] = isConfidential
      ? []
      : (data.comptesAnnuels ?? data.finances ?? []).map((f: any) => ({
          year: f.annee ?? f.year ?? new Date().getFullYear(),
          revenue: f.chiffreAffaires ?? f.revenue,
          netIncome: f.resultatNet ?? f.netIncome,
          totalAssets: f.totalBilan ?? f.totalAssets,
          employeeCount: f.effectif ?? f.employeeCount,
        }));

    return {
      siren,
      directors,
      beneficialOwners,
      financials,
      legalForm: data.formeJuridique ?? data.legalForm ?? '',
      capital: data.capital ?? data.capitalSocial,
      registrationDate:
        this.parseFlexibleDate(data.dateImmatriculation ?? data.registrationDate) ?? new Date(),
    };
  }

  private parseFlexibleDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    // ISO format: YYYY-MM-DD or YYYY-MM
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(dateStr)) return new Date(dateStr);
    // French format: DD/MM/YYYY
    const frMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (frMatch) return new Date(`${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`);
    return null;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > oneMinuteAgo);
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) return false;
    this.requestTimestamps.push(now);
    return true;
  }

  private isCircuitOpen(): boolean {
    if (!this.circuitOpen) return false;
    if (Date.now() - this.circuitOpenedAt > this.resetTimeoutMs) {
      this.circuitOpen = false;
      this.failureCount = 0;
      return false;
    }
    return true;
  }

  private onSuccess(): void {
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpen = true;
      this.circuitOpenedAt = Date.now();
      this.logger.error({ msg: 'Circuit breaker OPEN for INPI', failures: this.failureCount });
    }
  }
}
