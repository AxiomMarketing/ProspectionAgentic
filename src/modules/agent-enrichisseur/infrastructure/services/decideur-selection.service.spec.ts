import { DecideurSelectionService } from './decideur-selection.service';
import { HunterContact } from '../adapters/hunter.adapter';

function makeContact(overrides: Partial<HunterContact> = {}): HunterContact {
  return {
    email: 'test@example.com',
    confidence: 80,
    first_name: 'John',
    last_name: 'Doe',
    position: null,
    seniority: null,
    department: null,
    linkedin_url: null,
    ...overrides,
  };
}

describe('DecideurSelectionService', () => {
  let service: DecideurSelectionService;

  beforeEach(() => {
    service = new DecideurSelectionService();
  });

  describe('calculateDecideurScore', () => {
    it('pme_metro: CMO scores 10', () => {
      expect(service.calculateDecideurScore('CMO', 'pme_metro')).toBe(10);
    });

    it('pme_metro: Directeur Marketing scores 10', () => {
      expect(service.calculateDecideurScore('Directeur Marketing', 'pme_metro')).toBe(10);
    });

    it('pme_metro: CEO scores 8', () => {
      expect(service.calculateDecideurScore('CEO', 'pme_metro')).toBe(8);
    });

    it('pme_metro: CTO scores 6', () => {
      expect(service.calculateDecideurScore('CTO', 'pme_metro')).toBe(6);
    });

    it('pme_metro: unknown title scores 2', () => {
      expect(service.calculateDecideurScore('Accountant', 'pme_metro')).toBe(2);
    });

    it('ecommerce: Founder scores 10', () => {
      expect(service.calculateDecideurScore('Founder', 'ecommerce')).toBe(10);
    });

    it('ecommerce: Head of Growth scores 8', () => {
      expect(service.calculateDecideurScore('Head of Growth', 'ecommerce')).toBe(8);
    });

    it('collectivite: DGS scores 10', () => {
      expect(service.calculateDecideurScore('DGS', 'collectivite')).toBe(10);
    });

    it('collectivite: DSI scores 8', () => {
      expect(service.calculateDecideurScore('DSI', 'collectivite')).toBe(8);
    });

    it('startup: CEO scores 10', () => {
      expect(service.calculateDecideurScore('CEO', 'startup')).toBe(10);
    });

    it('startup: CTO scores 8', () => {
      expect(service.calculateDecideurScore('CTO', 'startup')).toBe(8);
    });

    it('agence_wl: Fondateur scores 10', () => {
      expect(service.calculateDecideurScore('Fondateur', 'agence_wl')).toBe(10);
    });

    it('agence_wl: Account Manager scores 6', () => {
      expect(service.calculateDecideurScore('Account Manager', 'agence_wl')).toBe(6);
    });

    it('returns 2 for unknown segment', () => {
      expect(service.calculateDecideurScore('CEO', 'unknown_segment')).toBe(2);
    });

    it('returns 2 for empty title', () => {
      expect(service.calculateDecideurScore('', 'pme_metro')).toBe(2);
    });
  });

  describe('selectBestDecideur', () => {
    it('returns null for empty contacts', () => {
      expect(service.selectBestDecideur([], 'pme_metro')).toBeNull();
    });

    it('returns primary as highest scored contact', () => {
      const contacts = [
        makeContact({ email: 'accountant@example.com', position: 'Accountant' }),
        makeContact({ email: 'cmo@example.com', position: 'CMO' }),
        makeContact({ email: 'ceo@example.com', position: 'CEO' }),
      ];

      const result = service.selectBestDecideur(contacts, 'pme_metro');
      expect(result).not.toBeNull();
      expect(result!.primary.email).toBe('cmo@example.com');
      expect(result!.primary.decideur_score).toBe(10);
    });

    it('returns up to 3 secondaires', () => {
      const contacts = [
        makeContact({ email: 'a@example.com', position: 'CMO' }),
        makeContact({ email: 'b@example.com', position: 'CEO' }),
        makeContact({ email: 'c@example.com', position: 'CTO' }),
        makeContact({ email: 'd@example.com', position: 'Accountant' }),
        makeContact({ email: 'e@example.com', position: 'Developer' }),
      ];

      const result = service.selectBestDecideur(contacts, 'pme_metro');
      expect(result!.secondaires).toHaveLength(3);
    });

    it('returns fewer secondaires when contacts are scarce', () => {
      const contacts = [
        makeContact({ email: 'a@example.com', position: 'CMO' }),
        makeContact({ email: 'b@example.com', position: 'CEO' }),
      ];

      const result = service.selectBestDecideur(contacts, 'pme_metro');
      expect(result!.secondaires).toHaveLength(1);
    });

    it('sorts contacts correctly by score for startup segment', () => {
      const contacts = [
        makeContact({ email: 'growth@example.com', position: 'Head of Growth' }),
        makeContact({ email: 'founder@example.com', position: 'Founder' }),
        makeContact({ email: 'cto@example.com', position: 'CTO' }),
      ];

      const result = service.selectBestDecideur(contacts, 'startup');
      expect(result!.primary.email).toBe('founder@example.com');
      expect(result!.secondaires[0].email).toBe('cto@example.com');
      expect(result!.secondaires[1].email).toBe('growth@example.com');
    });
  });

  describe('getDepartmentForSegment', () => {
    it('pme_metro maps to marketing', () => {
      expect(service.getDepartmentForSegment('pme_metro')).toBe('marketing');
    });

    it('ecommerce maps to executive', () => {
      expect(service.getDepartmentForSegment('ecommerce')).toBe('executive');
    });

    it('collectivite maps to it', () => {
      expect(service.getDepartmentForSegment('collectivite')).toBe('it');
    });

    it('startup maps to executive', () => {
      expect(service.getDepartmentForSegment('startup')).toBe('executive');
    });

    it('agence_wl maps to sales', () => {
      expect(service.getDepartmentForSegment('agence_wl')).toBe('sales');
    });

    it('unknown segment defaults to executive', () => {
      expect(service.getDepartmentForSegment('unknown')).toBe('executive');
    });
  });
});
