import { Injectable, Logger } from '@nestjs/common';
import { InseeAdapter } from '../adapters/insee.adapter';
import { PappersAdapter, PappersCompanyData } from '../adapters/pappers.adapter';
import { ILegalNoticesAdapter, LegalNotice } from '@common/ports/i-legal-notices.adapter';
import { ICompanyRegistryAdapter, CompanyDirector, CompanyFinancials } from '@common/ports/i-company-registry.adapter';

export interface FinancialAlerts {
  ca_en_baisse: boolean;
  effectif_en_baisse: boolean;
}

export interface CompanyEnrichmentResult {
  siren: string;
  // INSEE data
  legalName?: string;
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
  exactHeadcount?: number;
  isActive?: boolean;
  // INPI data
  directors: CompanyDirector[];
  beneficialOwners: CompanyDirector[];
  financials: CompanyFinancials[];
  legalForm?: string;
  capital?: number;
  // BODACC data
  legalNotices: LegalNotice[];
  hasCollectiveProcedure: boolean;
  // Financial alerts
  alertes: FinancialAlerts;
  // Metadata
  sourcesUsed: string[];
  sourcesUnavailable: string[];
  enrichedAt: Date;
}

@Injectable()
export class CompanyEnricherService {
  private readonly logger = new Logger(CompanyEnricherService.name);

  constructor(
    private readonly inseeAdapter: InseeAdapter,
    private readonly pappersAdapter: PappersAdapter,
    private readonly legalNoticesAdapter: ILegalNoticesAdapter,
    private readonly companyRegistryAdapter: ICompanyRegistryAdapter,
  ) {}

  async enrichBySiren(siren: string): Promise<CompanyEnrichmentResult> {
    this.logger.log({ msg: 'Starting company enrichment', siren });

    const result: CompanyEnrichmentResult = {
      siren,
      directors: [],
      beneficialOwners: [],
      financials: [],
      legalNotices: [],
      hasCollectiveProcedure: false,
      alertes: { ca_en_baisse: false, effectif_en_baisse: false },
      sourcesUsed: [],
      sourcesUnavailable: [],
      enrichedAt: new Date(),
    };

    // Step 1: INSEE (sequential, always first — provides SIRET/APE/address/status)
    try {
      const inseeData = await this.inseeAdapter.searchBySiren(siren);
      if (inseeData) {
        result.legalName = inseeData.legalName;
        result.tradeName = inseeData.tradeName;
        result.nafCode = inseeData.nafCode;
        result.nafLabel = inseeData.nafLabel;
        result.legalCategory = inseeData.legalCategory;
        result.creationDate = inseeData.creationDate;
        result.address = inseeData.address;
        result.employeeRange = inseeData.employeeRange;
        result.isActive = inseeData.isActive;
        result.sourcesUsed.push('insee');
      }
    } catch (error) {
      this.logger.error({ msg: 'INSEE fetch failed', siren, error: (error as Error).message });
      result.sourcesUnavailable.push('insee');
    }

    // Step 2: Pappers + INPI + BODACC in parallel
    const [pappersResult, inpiResult, bodaccResult] = await Promise.allSettled([
      this.pappersAdapter.getEntreprise(siren),
      this.companyRegistryAdapter.getBySiren(siren),
      this.legalNoticesAdapter.getNoticesBySiren(siren),
    ]);

    // Process Pappers result (priority source for financials, dirigeants, headcount)
    let pappersData: PappersCompanyData | null = null;
    if (pappersResult.status === 'fulfilled' && pappersResult.value) {
      pappersData = pappersResult.value;

      // Pappers financials → CompanyFinancials
      result.financials = pappersData.finances.map((f) => ({
        year: f.annee,
        revenue: f.ca,
        netIncome: f.resultat_net,
        employeeCount: f.effectif_moyen,
      }));

      // Pappers dirigeants → CompanyDirector (Pappers takes priority)
      result.directors = pappersData.dirigeants.map((d) => ({
        firstName: d.prenom,
        lastName: d.nom,
        role: d.fonction,
      }));

      // Pappers beneficial owners
      result.beneficialOwners = pappersData.beneficiaires_effectifs.map((b) => ({
        firstName: b.prenom,
        lastName: b.nom,
        role: 'Bénéficiaire effectif',
      }));

      // Exact headcount (separate from INSEE tranche)
      if (pappersData.effectif !== undefined) {
        result.exactHeadcount = pappersData.effectif;
      }

      // Capital and legal form from Pappers if missing
      if (pappersData.capital !== undefined) result.capital = pappersData.capital;
      if (pappersData.forme_juridique) result.legalForm = pappersData.forme_juridique;

      result.sourcesUsed.push('pappers');

      // Financial alerts: compare CA N vs N-1
      result.alertes = this.computeFinancialAlerts(pappersData);
    } else {
      result.sourcesUnavailable.push('pappers');
      if (pappersResult.status === 'rejected') {
        this.logger.warn({ msg: 'Pappers fetch failed', siren, error: pappersResult.reason?.message });
      }
    }

    // Process INPI result (fallback for directors/beneficialOwners if Pappers missed them)
    if (inpiResult.status === 'fulfilled' && inpiResult.value) {
      const inpiData = inpiResult.value;

      // Only use INPI directors if Pappers returned none
      if (result.directors.length === 0) {
        result.directors = inpiData.directors;
      }
      if (result.beneficialOwners.length === 0) {
        result.beneficialOwners = inpiData.beneficialOwners;
      }
      // Only use INPI financials if Pappers returned none
      if (result.financials.length === 0) {
        result.financials = inpiData.financials;
      }
      if (!result.legalForm) result.legalForm = inpiData.legalForm;
      if (result.capital === undefined) result.capital = inpiData.capital;

      result.sourcesUsed.push('inpi');
    } else {
      result.sourcesUnavailable.push('inpi');
      if (inpiResult.status === 'rejected') {
        this.logger.warn({ msg: 'INPI fetch failed', siren, error: inpiResult.reason?.message });
      }
    }

    // Process BODACC result (legal notices + cross-check procedures)
    if (bodaccResult.status === 'fulfilled') {
      result.legalNotices = bodaccResult.value;
      result.hasCollectiveProcedure =
        bodaccResult.value.some((n) => n.type === 'procedure_collective') ||
        (pappersData !== null && pappersData.procedures_collectives.length > 0);

      result.sourcesUsed.push('bodacc');

      if (result.hasCollectiveProcedure) {
        this.logger.warn({ msg: 'Collective procedure detected — prospect should be disqualified', siren });
      }
    } else {
      result.sourcesUnavailable.push('bodacc');
      this.logger.warn({ msg: 'BODACC fetch failed', siren, error: bodaccResult.reason?.message });

      // Still check Pappers procedures even if BODACC failed
      if (pappersData && pappersData.procedures_collectives.length > 0) {
        result.hasCollectiveProcedure = true;
        this.logger.warn({ msg: 'Collective procedure detected via Pappers — prospect should be disqualified', siren });
      }
    }

    this.logger.log({
      msg: 'Company enrichment complete',
      siren,
      sourcesUsed: result.sourcesUsed,
      sourcesUnavailable: result.sourcesUnavailable,
      hasCollectiveProcedure: result.hasCollectiveProcedure,
      alertes: result.alertes,
    });

    return result;
  }

  async enrichByName(companyName: string): Promise<CompanyEnrichmentResult | null> {
    try {
      const results = await this.inseeAdapter.searchByName(companyName, 1);
      if (results.length === 0) return null;
      return this.enrichBySiren(results[0].siren);
    } catch {
      return null;
    }
  }

  private computeFinancialAlerts(pappersData: PappersCompanyData): FinancialAlerts {
    const alerts: FinancialAlerts = { ca_en_baisse: false, effectif_en_baisse: false };
    const finances = [...pappersData.finances].sort((a, b) => b.annee - a.annee);

    if (finances.length < 2) return alerts;

    const latest = finances[0];
    const previous = finances[1];

    if (latest.ca !== undefined && previous.ca !== undefined && previous.ca > 0) {
      const caChange = (latest.ca - previous.ca) / previous.ca;
      alerts.ca_en_baisse = caChange < -0.10;
    }

    if (
      latest.effectif_moyen !== undefined &&
      previous.effectif_moyen !== undefined &&
      previous.effectif_moyen > 0
    ) {
      const effectifChange = (latest.effectif_moyen - previous.effectif_moyen) / previous.effectif_moyen;
      alerts.effectif_en_baisse = effectifChange < -0.05;
    }

    return alerts;
  }
}
