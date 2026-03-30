import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { validateExternalUrl } from '@common/utils/url-validator';
import { EnrichmentCacheService, CACHE_TTL } from '../services/enrichment-cache.service';

export interface PappersCompanyData {
  siren: string;
  siret: string;
  denomination: string;
  nom_commercial?: string;
  date_creation?: string;
  forme_juridique?: string;
  capital?: number;
  effectif?: number;
  tranche_effectif?: string;
  dirigeants: Array<{ nom: string; prenom: string; fonction: string; date_nomination?: string }>;
  beneficiaires_effectifs: Array<{ nom: string; prenom: string; pourcentage?: number }>;
  finances: Array<{ annee: number; ca?: number; resultat_net?: number; effectif_moyen?: number }>;
  procedures_collectives: Array<{ type: string; date?: string; decision?: string }>;
  adresse?: string;
  code_postal?: string;
  ville?: string;
}

@Injectable()
export class PappersAdapter {
  private readonly logger = new Logger(PappersAdapter.name);
  private readonly baseUrl = 'https://api.pappers.fr/v2';
  private readonly apiKey: string | null;

  // Rate limiting: handle 429 gracefully
  private lastRateLimitAt = 0;
  private readonly rateLimitCooldownMs = 60_000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly cache: EnrichmentCacheService,
  ) {
    this.apiKey = this.configService.get<string>('PAPPERS_API_KEY', '') || null;
    if (!this.apiKey) {
      this.logger.warn('PAPPERS_API_KEY not set — Pappers adapter unavailable');
    }
    validateExternalUrl(this.baseUrl);
  }

  async getEntreprise(siren: string): Promise<PappersCompanyData | null> {
    if (!this.apiKey) return null;
    if (this.isRateLimited()) {
      this.logger.warn({ msg: 'Pappers rate limit cooldown active', siren });
      return null;
    }

    const cacheKey = `enrichment:pappers:${siren}`;
    const cached = await this.cache.get<PappersCompanyData>(cacheKey);
    if (cached) return cached;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/entreprise`, {
          params: { siren, api_token: this.apiKey },
          timeout: 15_000,
        }),
      );
      const result = this.mapEntreprise(response.data);
      await this.cache.set(cacheKey, result, CACHE_TTL.PAPPERS);
      return result;
    } catch (error: any) {
      if (error?.response?.status === 429) {
        this.lastRateLimitAt = Date.now();
        this.logger.warn({ msg: 'Pappers 429 rate limit hit', siren });
        return null;
      }
      if (error?.response?.status === 404) {
        this.logger.debug({ msg: 'SIREN not found in Pappers', siren });
        return null;
      }
      this.logger.error({ msg: 'Pappers getEntreprise failed', siren, error: error.message });
      return null;
    }
  }

  async searchByName(name: string, limit = 5): Promise<PappersCompanyData[]> {
    if (!this.apiKey) return [];
    if (this.isRateLimited()) {
      this.logger.warn({ msg: 'Pappers rate limit cooldown active, skipping name search', name });
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/recherche`, {
          params: { q: name, api_token: this.apiKey, par_page: limit },
          timeout: 15_000,
        }),
      );
      const resultats: any[] = response.data?.resultats ?? [];
      return resultats.map((r) => this.mapEntreprise(r));
    } catch (error: any) {
      if (error?.response?.status === 429) {
        this.lastRateLimitAt = Date.now();
        this.logger.warn({ msg: 'Pappers 429 rate limit hit during search', name });
        return [];
      }
      this.logger.error({ msg: 'Pappers searchByName failed', name, error: error.message });
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    return true;
  }

  private isRateLimited(): boolean {
    return this.lastRateLimitAt > 0 && Date.now() - this.lastRateLimitAt < this.rateLimitCooldownMs;
  }

  private mapEntreprise(data: any): PappersCompanyData {
    const dirigeants = (data.dirigeants ?? []).map((d: any) => ({
      nom: d.nom ?? '',
      prenom: d.prenom ?? '',
      fonction: d.fonction ?? d.qualite ?? '',
      date_nomination: d.date_prise_de_poste ?? d.date_nomination,
    }));

    const beneficiaires = (data.beneficiaires_effectifs ?? []).map((b: any) => ({
      nom: b.nom ?? '',
      prenom: b.prenom ?? '',
      pourcentage: b.pourcentage_parts ?? b.pourcentage,
    }));

    const finances = (data.finances ?? data.comptes_annuels ?? []).map((f: any) => ({
      annee: f.annee ?? f.year ?? new Date().getFullYear(),
      ca: f.chiffre_affaires ?? f.ca,
      resultat_net: f.resultat_net ?? f.resultat,
      effectif_moyen: f.effectif_moyen ?? f.effectif,
    }));

    const procedures = (data.procedures_collectives ?? []).map((p: any) => ({
      type: p.type ?? '',
      date: p.date,
      decision: p.decision,
    }));

    return {
      siren: data.siren ?? '',
      siret: data.siret_siege ?? data.siret ?? '',
      denomination: data.nom_entreprise ?? data.denomination ?? '',
      nom_commercial: data.nom_commercial ?? undefined,
      date_creation: data.date_creation ?? undefined,
      forme_juridique: data.forme_juridique ?? undefined,
      capital: data.capital ?? undefined,
      effectif: data.effectif ?? undefined,
      tranche_effectif: data.tranche_effectif ?? undefined,
      dirigeants,
      beneficiaires_effectifs: beneficiaires,
      finances,
      procedures_collectives: procedures,
      adresse: data.siege?.adresse_ligne_1 ?? data.adresse ?? undefined,
      code_postal: data.siege?.code_postal ?? data.code_postal ?? undefined,
      ville: data.siege?.ville ?? data.ville ?? undefined,
    };
  }
}
