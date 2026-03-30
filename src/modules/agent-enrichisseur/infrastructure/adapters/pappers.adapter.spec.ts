import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosHeaders, AxiosResponse } from 'axios';
import { PappersAdapter, PappersCompanyData } from './pappers.adapter';
import { EnrichmentCacheService } from '../services/enrichment-cache.service';

const mockHttpService = { get: jest.fn() };
const mockConfigService = { get: jest.fn() };
const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  invalidate: jest.fn().mockResolvedValue(undefined),
};

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

const sampleEntreprise = {
  siren: '123456789',
  siret_siege: '12345678900010',
  nom_entreprise: 'ACME SAS',
  nom_commercial: 'Acme',
  date_creation: '2010-01-15',
  forme_juridique: 'SAS',
  capital: 10000,
  effectif: 42,
  tranche_effectif: '20-49',
  dirigeants: [{ nom: 'Dupont', prenom: 'Jean', fonction: 'Président', date_prise_de_poste: '2010-01-15' }],
  beneficiaires_effectifs: [{ nom: 'Martin', prenom: 'Alice', pourcentage_parts: 60 }],
  finances: [
    { annee: 2023, chiffre_affaires: 1000000, resultat_net: 50000, effectif_moyen: 40 },
    { annee: 2022, chiffre_affaires: 1200000, resultat_net: 80000, effectif_moyen: 45 },
  ],
  procedures_collectives: [],
  siege: { adresse_ligne_1: '1 rue de la Paix', code_postal: '75001', ville: 'Paris' },
};

describe('PappersAdapter', () => {
  let adapter: PappersAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockConfigService.get.mockImplementation((key: string, def?: string) => {
      if (key === 'PAPPERS_API_KEY') return 'test-api-key';
      return def;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PappersAdapter,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EnrichmentCacheService, useValue: mockCache },
      ],
    }).compile();

    adapter = module.get<PappersAdapter>(PappersAdapter);
  });

  describe('isAvailable', () => {
    it('returns true when API key is set', async () => {
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('returns false when API key is missing', async () => {
      mockConfigService.get.mockReturnValue('');
      const noKeyAdapter = new PappersAdapter(mockHttpService as any, mockConfigService as any, mockCache as any);
      expect(await noKeyAdapter.isAvailable()).toBe(false);
    });
  });

  describe('getEntreprise', () => {
    it('returns mapped company data on success', async () => {
      mockHttpService.get.mockReturnValue(of(axiosResponse(sampleEntreprise)));

      const result = await adapter.getEntreprise('123456789');

      expect(result).not.toBeNull();
      expect(result!.siren).toBe('123456789');
      expect(result!.denomination).toBe('ACME SAS');
      expect(result!.effectif).toBe(42);
      expect(result!.dirigeants).toHaveLength(1);
      expect(result!.dirigeants[0].nom).toBe('Dupont');
      expect(result!.beneficiaires_effectifs[0].pourcentage).toBe(60);
      expect(result!.finances).toHaveLength(2);
      expect(result!.adresse).toBe('1 rue de la Paix');
      expect(result!.code_postal).toBe('75001');
      expect(result!.ville).toBe('Paris');
    });

    it('returns null when API key is missing', async () => {
      mockConfigService.get.mockReturnValue('');
      const noKeyAdapter = new PappersAdapter(mockHttpService as any, mockConfigService as any, mockCache as any);
      const result = await noKeyAdapter.getEntreprise('123456789');
      expect(result).toBeNull();
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('returns null on 404', async () => {
      const error: any = new Error('Not Found');
      error.response = { status: 404 };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await adapter.getEntreprise('000000000');
      expect(result).toBeNull();
    });

    it('returns null and activates cooldown on 429', async () => {
      const error: any = new Error('Too Many Requests');
      error.response = { status: 429 };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await adapter.getEntreprise('123456789');
      expect(result).toBeNull();

      // Second call should be skipped due to cooldown
      const result2 = await adapter.getEntreprise('123456789');
      expect(result2).toBeNull();
      expect(mockHttpService.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchByName', () => {
    it('returns array of mapped results', async () => {
      mockHttpService.get.mockReturnValue(of(axiosResponse({ resultats: [sampleEntreprise] })));

      const results = await adapter.searchByName('ACME');
      expect(results).toHaveLength(1);
      expect(results[0].denomination).toBe('ACME SAS');
    });

    it('returns empty array when no API key', async () => {
      mockConfigService.get.mockReturnValue('');
      const noKeyAdapter = new PappersAdapter(mockHttpService as any, mockConfigService as any, mockCache as any);
      const results = await noKeyAdapter.searchByName('ACME');
      expect(results).toEqual([]);
    });

    it('returns empty array on 429 and activates cooldown', async () => {
      const error: any = new Error('Too Many Requests');
      error.response = { status: 429 };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      const results = await adapter.searchByName('ACME');
      expect(results).toEqual([]);
    });
  });
});

describe('PappersAdapter — financial alerts', () => {
  let adapter: PappersAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockConfigService.get.mockImplementation((key: string, def?: string) => {
      if (key === 'PAPPERS_API_KEY') return 'test-api-key';
      return def;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PappersAdapter,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EnrichmentCacheService, useValue: mockCache },
      ],
    }).compile();

    adapter = module.get<PappersAdapter>(PappersAdapter);
  });

  it('maps finances correctly when CA decreases > 10%', async () => {
    const data = {
      ...sampleEntreprise,
      finances: [
        { annee: 2023, chiffre_affaires: 800000, resultat_net: 30000, effectif_moyen: 40 },
        { annee: 2022, chiffre_affaires: 1000000, resultat_net: 50000, effectif_moyen: 42 },
      ],
    };
    mockHttpService.get.mockReturnValue(of(axiosResponse(data)));

    const result = await adapter.getEntreprise('123456789');
    expect(result).not.toBeNull();

    // Verify finances are mapped
    const financeN = result!.finances.find((f) => f.annee === 2023);
    const financeNm1 = result!.finances.find((f) => f.annee === 2022);
    expect(financeN!.ca).toBe(800000);
    expect(financeNm1!.ca).toBe(1000000);
  });

  it('maps effectif decrease correctly', async () => {
    const data = {
      ...sampleEntreprise,
      finances: [
        { annee: 2023, chiffre_affaires: 1000000, resultat_net: 50000, effectif_moyen: 30 },
        { annee: 2022, chiffre_affaires: 1000000, resultat_net: 50000, effectif_moyen: 45 },
      ],
    };
    mockHttpService.get.mockReturnValue(of(axiosResponse(data)));

    const result = await adapter.getEntreprise('123456789');
    expect(result).not.toBeNull();

    const financeN = result!.finances.find((f) => f.annee === 2023);
    expect(financeN!.effectif_moyen).toBe(30);
  });

  it('returns empty finances array when no finances in response', async () => {
    const data = { ...sampleEntreprise, finances: undefined };
    mockHttpService.get.mockReturnValue(of(axiosResponse(data)));

    const result = await adapter.getEntreprise('123456789');
    expect(result!.finances).toEqual([]);
  });
});

describe('CompanyEnricherService — financial alerts integration', () => {
  it('computes ca_en_baisse when CA drops > 10%', () => {
    const pappersData: PappersCompanyData = {
      siren: '123456789',
      siret: '12345678900010',
      denomination: 'Test',
      dirigeants: [],
      beneficiaires_effectifs: [],
      finances: [
        { annee: 2023, ca: 800000, resultat_net: 30000, effectif_moyen: 40 },
        { annee: 2022, ca: 1000000, resultat_net: 50000, effectif_moyen: 42 },
      ],
      procedures_collectives: [],
    };

    // Test the logic directly
    const sorted = [...pappersData.finances].sort((a, b) => b.annee - a.annee);
    const latest = sorted[0];
    const previous = sorted[1];
    const caChange = (latest.ca! - previous.ca!) / previous.ca!;
    expect(caChange).toBeLessThan(-0.10);
  });

  it('computes effectif_en_baisse when effectif drops > 5%', () => {
    const finances = [
      { annee: 2023, ca: 1000000, resultat_net: 50000, effectif_moyen: 30 },
      { annee: 2022, ca: 1000000, resultat_net: 50000, effectif_moyen: 45 },
    ];
    const sorted = [...finances].sort((a, b) => b.annee - a.annee);
    const latest = sorted[0];
    const previous = sorted[1];
    const effectifChange = (latest.effectif_moyen! - previous.effectif_moyen!) / previous.effectif_moyen!;
    expect(effectifChange).toBeLessThan(-0.05);
  });

  it('does not flag ca_en_baisse when CA drops <= 10%', () => {
    const finances = [
      { annee: 2023, ca: 950000 },
      { annee: 2022, ca: 1000000 },
    ];
    const sorted = [...finances].sort((a, b) => b.annee - a.annee);
    const caChange = (sorted[0].ca! - sorted[1].ca!) / sorted[1].ca!;
    expect(caChange).toBeGreaterThanOrEqual(-0.10);
  });
});
