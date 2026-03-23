import { RawLead, RawLeadProps } from './raw-lead.entity';

describe('RawLead', () => {
  const baseParams = {
    source: 'boamp',
    sourceId: 'BOAMP-001',
    sourceUrl: 'https://www.boamp.fr/avis/BOAMP-001',
    rawData: { title: 'Test opportunity' },
  };

  describe('create()', () => {
    it('generates a UUID id', () => {
      const lead = RawLead.create(baseParams);
      expect(lead.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs for each created lead', () => {
      const lead1 = RawLead.create(baseParams);
      const lead2 = RawLead.create(baseParams);
      expect(lead1.id).not.toBe(lead2.id);
    });

    it('sets processed to false', () => {
      const lead = RawLead.create(baseParams);
      expect(lead.processed).toBe(false);
    });

    it('sets createdAt to current date', () => {
      const before = new Date();
      const lead = RawLead.create(baseParams);
      const after = new Date();

      expect(lead.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lead.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('sets source and sourceId correctly', () => {
      const lead = RawLead.create(baseParams);
      expect(lead.source).toBe('boamp');
      expect(lead.sourceId).toBe('BOAMP-001');
    });

    it('sets sourceUrl when provided', () => {
      const lead = RawLead.create(baseParams);
      expect(lead.sourceUrl).toBe('https://www.boamp.fr/avis/BOAMP-001');
    });

    it('prospectId is undefined initially', () => {
      const lead = RawLead.create(baseParams);
      expect(lead.prospectId).toBeUndefined();
    });
  });

  describe('reconstitute()', () => {
    it('preserves all properties exactly', () => {
      const fixedDate = new Date('2026-03-20T10:00:00Z');
      const processedDate = new Date('2026-03-21T10:00:00Z');

      const props: RawLeadProps = {
        id: 'fixed-uuid-123',
        source: 'boamp',
        sourceId: 'BOAMP-001',
        sourceUrl: 'https://www.boamp.fr/avis/BOAMP-001',
        rawData: { key: 'value' },
        processed: true,
        processedAt: processedDate,
        prospectId: 'prospect-456',
        createdAt: fixedDate,
      };

      const lead = RawLead.reconstitute(props);

      expect(lead.id).toBe('fixed-uuid-123');
      expect(lead.source).toBe('boamp');
      expect(lead.sourceId).toBe('BOAMP-001');
      expect(lead.sourceUrl).toBe('https://www.boamp.fr/avis/BOAMP-001');
      expect(lead.rawData).toEqual({ key: 'value' });
      expect(lead.processed).toBe(true);
      expect(lead.processedAt).toBe(processedDate);
      expect(lead.prospectId).toBe('prospect-456');
      expect(lead.createdAt).toBe(fixedDate);
    });
  });

  describe('markAsProcessed()', () => {
    it('returns a NEW instance (immutability)', () => {
      const lead = RawLead.create(baseParams);
      const processed = lead.markAsProcessed('prospect-789');
      expect(processed).not.toBe(lead);
    });

    it('sets processed to true on the new instance', () => {
      const lead = RawLead.create(baseParams);
      const processed = lead.markAsProcessed('prospect-789');
      expect(processed.processed).toBe(true);
    });

    it('original instance remains unprocessed', () => {
      const lead = RawLead.create(baseParams);
      lead.markAsProcessed('prospect-789');
      expect(lead.processed).toBe(false);
    });

    it('sets prospectId on the new instance', () => {
      const lead = RawLead.create(baseParams);
      const processed = lead.markAsProcessed('prospect-789');
      expect(processed.prospectId).toBe('prospect-789');
    });

    it('sets processedAt on the new instance', () => {
      const before = new Date();
      const lead = RawLead.create(baseParams);
      const processed = lead.markAsProcessed('prospect-789');
      const after = new Date();

      expect(processed.processedAt).toBeInstanceOf(Date);
      expect(processed.processedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(processed.processedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('preserves other properties', () => {
      const lead = RawLead.create(baseParams);
      const processed = lead.markAsProcessed('prospect-789');

      expect(processed.id).toBe(lead.id);
      expect(processed.source).toBe(lead.source);
      expect(processed.sourceId).toBe(lead.sourceId);
    });
  });

  describe('toPlainObject()', () => {
    it('returns all properties', () => {
      const lead = RawLead.create(baseParams);
      const plain = lead.toPlainObject();

      expect(plain).toMatchObject({
        source: 'boamp',
        sourceId: 'BOAMP-001',
        sourceUrl: 'https://www.boamp.fr/avis/BOAMP-001',
        rawData: { title: 'Test opportunity' },
        processed: false,
      });
      expect(plain.id).toBeDefined();
      expect(plain.createdAt).toBeInstanceOf(Date);
    });

    it('returns a copy (not the internal reference)', () => {
      const lead = RawLead.create(baseParams);
      const plain1 = lead.toPlainObject();
      const plain2 = lead.toPlainObject();
      expect(plain1).not.toBe(plain2);
    });
  });
});
