import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { BoampAdapter } from './boamp.adapter';

// Mock validateExternalUrl to avoid real URL validation in tests
jest.mock('@common/utils/url-validator', () => ({
  validateExternalUrl: jest.fn(),
}));

const mockOpendatasoftResults = [
  {
    idweb: 'BOAMP-001',
    nomacheteur: 'Commune de Paris',
    objet: 'Marché de prestation informatique et cloud',
    descripteur_libelle: 'Services informatiques',
    dateparution: '2026-03-20',
    datelimitereponse: '2026-04-15',
    url_avis: 'https://www.boamp.fr/avis/detail/BOAMP-001',
    descripteur_code: '72000000',
  },
  {
    idweb: 'BOAMP-002',
    nomacheteur: 'Région Île-de-France',
    objet: 'Fourniture de matériel bureautique',
    descripteur_libelle: 'Mobilier de bureau',
    dateparution: '2026-03-21',
  },
];

describe('BoampAdapter', () => {
  let adapter: BoampAdapter;
  let mockHttpService: { get: jest.Mock };

  beforeEach(async () => {
    mockHttpService = {
      get: jest.fn().mockReturnValue(
        of({ data: { total_count: 2, results: mockOpendatasoftResults } }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoampAdapter,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    adapter = module.get<BoampAdapter>(BoampAdapter);
  });

  describe('fetchRecentOpportunities()', () => {
    it('maps Opendatasoft record to MarketOpportunity', async () => {
      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique', 'cloud'],
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        url: 'https://www.boamp.fr/avis/detail/BOAMP-001',
        companyName: 'Commune de Paris',
        title: 'Marché de prestation informatique et cloud',
        cpvCodes: ['72000000'],
      });
      expect(results[0].publishedAt).toBeInstanceOf(Date);
      expect(results[0].deadline).toBeInstanceOf(Date);
    });

    it('calculates relevance score based on keyword matches', async () => {
      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique', 'cloud', 'cybersécurité'],
      });

      // item[0]: objet contains "informatique" and "cloud" but not "cybersécurité"
      expect(results[0].relevanceScore).toBe(67);
    });

    it('returns empty array when no results', async () => {
      mockHttpService.get.mockReturnValueOnce(of({ data: { total_count: 0, results: [] } }));

      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique'],
      });

      expect(results).toEqual([]);
    });

    it('uses "Inconnu" when nomacheteur is missing', async () => {
      const itemWithoutAcheteur = { ...mockOpendatasoftResults[0], nomacheteur: undefined };
      mockHttpService.get.mockReturnValueOnce(
        of({ data: { total_count: 1, results: [itemWithoutAcheteur] } }),
      );

      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique'],
      });

      expect(results[0].companyName).toBe('Inconnu');
    });

    it('throws on HTTP error', async () => {
      mockHttpService.get.mockReturnValueOnce(throwError(() => new Error('Network error')));

      await expect(
        adapter.fetchRecentOpportunities({
          source: 'boamp',
          since: new Date('2026-03-15'),
          keywords: ['informatique'],
        }),
      ).rejects.toThrow('Network error');
    });
  });

  describe('isAvailable()', () => {
    it('returns true when HTTP call succeeds', async () => {
      mockHttpService.get.mockReturnValueOnce(of({ data: {} }));
      const result = await adapter.isAvailable();
      expect(result).toBe(true);
    });

    it('returns false when HTTP call fails', async () => {
      mockHttpService.get.mockReturnValueOnce(throwError(() => new Error('Timeout')));
      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });
});
