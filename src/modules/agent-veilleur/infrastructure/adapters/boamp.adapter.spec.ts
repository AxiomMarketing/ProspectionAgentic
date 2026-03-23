import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { BoampAdapter } from './boamp.adapter';

const mockBoampItems = [
  {
    idWeb: 'BOAMP-001',
    acheteur: { nom: 'Commune de Paris' },
    objet: 'Marché de prestation informatique et cloud',
    descriptif: 'Développement logiciel et infrastructure cloud AWS',
    dateParution: '2026-03-20',
    dateLimite: '2026-04-15',
    valeurEstimee: 150000,
    cpv: [{ code: '72000000' }],
    url: 'https://www.boamp.fr/avis/BOAMP-001',
  },
  {
    idWeb: 'BOAMP-002',
    acheteur: { nom: 'Région Île-de-France' },
    objet: 'Fourniture de matériel bureautique',
    descriptif: 'Achat de matériel et mobilier de bureau',
    dateParution: '2026-03-21',
    dateLimite: undefined,
    valeurEstimee: undefined,
    cpv: [],
    url: 'https://www.boamp.fr/avis/BOAMP-002',
  },
];

describe('BoampAdapter', () => {
  let adapter: BoampAdapter;
  let mockHttpService: { get: jest.Mock };

  beforeEach(async () => {
    mockHttpService = {
      get: jest.fn().mockReturnValue(of({ data: { results: mockBoampItems } })),
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
    it('maps BoampAvisItem correctly to MarketOpportunity', async () => {
      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique', 'cloud'],
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        url: 'https://www.boamp.fr/avis/BOAMP-001',
        companyName: 'Commune de Paris',
        title: 'Marché de prestation informatique et cloud',
        description: 'Développement logiciel et infrastructure cloud AWS',
        estimatedValue: 150000,
        cpvCodes: ['72000000'],
      });
      expect(results[0].publishedAt).toBeInstanceOf(Date);
      expect(results[0].deadline).toBeInstanceOf(Date);
    });

    it('calculates relevance score: 2 of 3 keywords match ~67', async () => {
      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique', 'cloud', 'cybersécurité'],
      });

      // item[0]: objet+descriptif contains "informatique" and "cloud" but not "cybersécurité"
      // matchCount=2, total=3 → Math.round(2/3 * 100) = 67
      expect(results[0].relevanceScore).toBe(67);
    });

    it('calculates relevance score: 0 keywords match → 0', async () => {
      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['cybersécurité', 'pentest', 'siem'],
      });

      expect(results[0].relevanceScore).toBe(0);
    });

    it('returns empty array when no results', async () => {
      mockHttpService.get.mockReturnValueOnce(of({ data: { results: [] } }));

      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique'],
      });

      expect(results).toEqual([]);
    });

    it('uses url from item when available', async () => {
      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique'],
      });

      expect(results[0].url).toBe('https://www.boamp.fr/avis/BOAMP-001');
    });

    it('falls back to constructed url when item.url missing', async () => {
      const itemWithoutUrl = { ...mockBoampItems[0], url: undefined };
      mockHttpService.get.mockReturnValueOnce(of({ data: { results: [itemWithoutUrl] } }));

      const results = await adapter.fetchRecentOpportunities({
        source: 'boamp',
        since: new Date('2026-03-15'),
        keywords: ['informatique'],
      });

      expect(results[0].url).toBe('https://www.boamp.fr/avis/BOAMP-001');
    });

    it('uses "Inconnu" when acheteur.nom is missing', async () => {
      const itemWithoutAcheteur = { ...mockBoampItems[0], acheteur: undefined };
      mockHttpService.get.mockReturnValueOnce(of({ data: { results: [itemWithoutAcheteur] } }));

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
