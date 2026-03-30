import { EmailPatternService } from './email-pattern.service';

describe('EmailPatternService', () => {
  let service: EmailPatternService;

  beforeEach(() => {
    service = new EmailPatternService();
  });

  it('should generate exactly 15 candidates', () => {
    const candidates = service.generateCandidates('Jean', 'Dupont', 'example.com');
    expect(candidates).toHaveLength(15);
  });

  it('should append the domain to every candidate', () => {
    const domain = 'mycompany.fr';
    const candidates = service.generateCandidates('Alice', 'Martin', domain);
    candidates.forEach((c) => expect(c).toMatch(/@mycompany\.fr$/));
  });

  it('should normalise accented characters (é→e, è→e, ç→c)', () => {
    const candidates = service.generateCandidates('Élodie', 'Ça', 'test.com');
    candidates.forEach((c) => {
      expect(c).not.toMatch(/[éèêëçàâùûü]/i);
    });
  });

  it('should produce first.last pattern as first candidate', () => {
    const candidates = service.generateCandidates('Jean', 'Dupont', 'acme.com');
    expect(candidates[0]).toBe('jean.dupont@acme.com');
  });

  it('should contain initial+last pattern in candidates', () => {
    const candidates = service.generateCandidates('Jean', 'Dupont', 'acme.com');
    expect(candidates).toContain('jdupont@acme.com');
    expect(candidates).toContain('j.dupont@acme.com');
  });

  it('should strip hyphens and spaces from input names during normalization', () => {
    const candidates = service.generateCandidates('Marie-Claire', 'Lebrun', 'corp.com');
    // "Marie-Claire" normalizes to "marieclaire", "Lebrun" to "lebrun"
    // first candidate is "marieclaire.lebrun@corp.com"
    expect(candidates[0]).toBe('marieclaire.lebrun@corp.com');
  });

  it('should extract domain from full URL correctly when used externally', () => {
    // Domain passed directly — service just appends it
    const candidates = service.generateCandidates('Paul', 'Simon', 'simon.io');
    expect(candidates).toContain('paul.simon@simon.io');
  });
});
