import { Tender, TenderStatus, TenderProps } from '../tender.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function makeCreateParams(): Omit<TenderProps, 'id' | 'status' | 'dceAnalyzed' | 'createdAt'> {
  return {
    source: 'BOAMP',
    sourceId: 'REF-2026-001',
    sourceUrl: 'https://boamp.fr/avis/001',
    title: 'Marché de services informatiques',
    description: 'Prestation de développement logiciel',
    buyerName: 'Région Île-de-France',
    buyerSiren: '123456789',
    publicationDate: new Date('2026-01-10'),
    deadlineDate: new Date('2026-02-28'),
    estimatedAmount: 150000,
  };
}

describe('Tender entity', () => {
  describe('create()', () => {
    it('should create a new tender with DETECTED status', () => {
      const tender = Tender.create(makeCreateParams());
      expect(tender.status).toBe(TenderStatus.DETECTED);
    });

    it('should generate UUID on creation', () => {
      const tender = Tender.create(makeCreateParams());
      expect(tender.id).toMatch(UUID_REGEX);
    });

    it('should set dceAnalyzed to false on creation', () => {
      const tender = Tender.create(makeCreateParams());
      expect(tender.dceAnalyzed).toBe(false);
    });

    it('should set createdAt to current date on creation', () => {
      const before = new Date();
      const tender = Tender.create(makeCreateParams());
      expect(tender.createdAt).toBeInstanceOf(Date);
      expect(tender.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should assign source fields correctly', () => {
      const params = makeCreateParams();
      const tender = Tender.create(params);
      expect(tender.source).toBe(params.source);
      expect(tender.sourceId).toBe(params.sourceId);
      expect(tender.title).toBe(params.title);
      expect(tender.buyerName).toBe(params.buyerName);
    });

    it('should generate unique IDs for each create call', () => {
      const a = Tender.create(makeCreateParams());
      const b = Tender.create(makeCreateParams());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute from existing props', () => {
      const props: TenderProps = {
        id: '00000000-0000-0000-0000-000000000001',
        source: 'BOAMP',
        sourceId: 'REF-001',
        title: 'Test tender',
        status: TenderStatus.QUALIFIED,
        dceAnalyzed: true,
        dceFitScore: 82,
        createdAt: new Date('2026-01-01'),
      };
      const tender = Tender.reconstitute(props);
      expect(tender.id).toBe(props.id);
      expect(tender.status).toBe(TenderStatus.QUALIFIED);
      expect(tender.dceFitScore).toBe(82);
      expect(tender.dceAnalyzed).toBe(true);
    });
  });

  describe('canTransitionTo()', () => {
    it('should return true for valid transition DETECTED → ANALYZING', () => {
      const tender = Tender.create(makeCreateParams());
      expect(tender.canTransitionTo(TenderStatus.ANALYZING)).toBe(true);
    });

    it('should return true for valid transition DETECTED → IGNORED', () => {
      const tender = Tender.create(makeCreateParams());
      expect(tender.canTransitionTo(TenderStatus.IGNORED)).toBe(true);
    });

    it('should return false for invalid transition DETECTED → SUBMITTED', () => {
      const tender = Tender.create(makeCreateParams());
      expect(tender.canTransitionTo(TenderStatus.SUBMITTED)).toBe(false);
    });

    it('should return false for invalid transition DETECTED → WON', () => {
      const tender = Tender.create(makeCreateParams());
      expect(tender.canTransitionTo(TenderStatus.WON)).toBe(false);
    });
  });

  describe('transitionTo()', () => {
    it('should allow DETECTED → ANALYZING', () => {
      const tender = Tender.create(makeCreateParams()).transitionTo(TenderStatus.ANALYZING);
      expect(tender.status).toBe(TenderStatus.ANALYZING);
    });

    it('should allow ANALYZING → QUALIFIED', () => {
      const tender = Tender.create(makeCreateParams())
        .transitionTo(TenderStatus.ANALYZING)
        .transitionTo(TenderStatus.QUALIFIED);
      expect(tender.status).toBe(TenderStatus.QUALIFIED);
    });

    it('should allow QUALIFIED → GO', () => {
      const tender = Tender.create(makeCreateParams())
        .transitionTo(TenderStatus.ANALYZING)
        .transitionTo(TenderStatus.QUALIFIED)
        .transitionTo(TenderStatus.GO);
      expect(tender.status).toBe(TenderStatus.GO);
    });

    it('should allow GO → IN_PROGRESS', () => {
      const tender = Tender.create(makeCreateParams())
        .transitionTo(TenderStatus.ANALYZING)
        .transitionTo(TenderStatus.QUALIFIED)
        .transitionTo(TenderStatus.GO)
        .transitionTo(TenderStatus.IN_PROGRESS);
      expect(tender.status).toBe(TenderStatus.IN_PROGRESS);
    });

    it('should allow IN_PROGRESS → SUBMITTED', () => {
      const tender = Tender.create(makeCreateParams())
        .transitionTo(TenderStatus.ANALYZING)
        .transitionTo(TenderStatus.QUALIFIED)
        .transitionTo(TenderStatus.GO)
        .transitionTo(TenderStatus.IN_PROGRESS)
        .transitionTo(TenderStatus.SUBMITTED);
      expect(tender.status).toBe(TenderStatus.SUBMITTED);
    });

    it('should allow SUBMITTED → WON', () => {
      const tender = Tender.create(makeCreateParams())
        .transitionTo(TenderStatus.ANALYZING)
        .transitionTo(TenderStatus.QUALIFIED)
        .transitionTo(TenderStatus.GO)
        .transitionTo(TenderStatus.IN_PROGRESS)
        .transitionTo(TenderStatus.SUBMITTED)
        .transitionTo(TenderStatus.WON);
      expect(tender.status).toBe(TenderStatus.WON);
    });

    it('should allow SUBMITTED → LOST', () => {
      const tender = Tender.create(makeCreateParams())
        .transitionTo(TenderStatus.ANALYZING)
        .transitionTo(TenderStatus.QUALIFIED)
        .transitionTo(TenderStatus.GO)
        .transitionTo(TenderStatus.IN_PROGRESS)
        .transitionTo(TenderStatus.SUBMITTED)
        .transitionTo(TenderStatus.LOST);
      expect(tender.status).toBe(TenderStatus.LOST);
    });

    it('should allow transition to IGNORED from multiple states', () => {
      const fromDetected = Tender.create(makeCreateParams()).transitionTo(TenderStatus.IGNORED);
      expect(fromDetected.status).toBe(TenderStatus.IGNORED);

      const fromAnalyzing = Tender.create(makeCreateParams())
        .transitionTo(TenderStatus.ANALYZING)
        .transitionTo(TenderStatus.IGNORED);
      expect(fromAnalyzing.status).toBe(TenderStatus.IGNORED);
    });

    it('should reject invalid transition DETECTED → SUBMITTED with descriptive message', () => {
      const tender = Tender.create(makeCreateParams());
      expect(() => tender.transitionTo(TenderStatus.SUBMITTED)).toThrow(
        /Invalid transition.*DETECTED.*SUBMITTED/,
      );
    });

    it('should throw with allowed transitions listed in error message', () => {
      const tender = Tender.create(makeCreateParams());
      expect(() => tender.transitionTo(TenderStatus.WON)).toThrow(/Allowed:/);
    });

    it('should throw when transitioning from terminal state WON', () => {
      const tender = Tender.reconstitute({
        id: '00000000-0000-0000-0000-000000000001',
        source: 'BOAMP',
        sourceId: 'REF-001',
        title: 'Won tender',
        status: TenderStatus.WON,
        dceAnalyzed: true,
        createdAt: new Date(),
      });
      expect(() => tender.transitionTo(TenderStatus.LOST)).toThrow(/Invalid transition/);
    });

    it('should throw when transitioning from terminal state LOST', () => {
      const tender = Tender.reconstitute({
        id: '00000000-0000-0000-0000-000000000001',
        source: 'BOAMP',
        sourceId: 'REF-001',
        title: 'Lost tender',
        status: TenderStatus.LOST,
        dceAnalyzed: false,
        createdAt: new Date(),
      });
      expect(() => tender.transitionTo(TenderStatus.WON)).toThrow(/Invalid transition/);
    });

    it('should throw when transitioning from terminal state IGNORED', () => {
      const tender = Tender.reconstitute({
        id: '00000000-0000-0000-0000-000000000001',
        source: 'BOAMP',
        sourceId: 'REF-001',
        title: 'Ignored tender',
        status: TenderStatus.IGNORED,
        dceAnalyzed: false,
        createdAt: new Date(),
      });
      expect(() => tender.transitionTo(TenderStatus.ANALYZING)).toThrow(/Invalid transition/);
    });

    it('should return a new Tender instance (immutability)', () => {
      const original = Tender.create(makeCreateParams());
      const next = original.transitionTo(TenderStatus.ANALYZING);
      expect(next).not.toBe(original);
      expect(original.status).toBe(TenderStatus.DETECTED);
      expect(next.status).toBe(TenderStatus.ANALYZING);
    });
  });

  describe('markAnalyzed()', () => {
    it('should mark as analyzed with dceFitScore', () => {
      const tender = Tender.create(makeCreateParams());
      const analyzed = tender.markAnalyzed(78);
      expect(analyzed.dceFitScore).toBe(78);
      expect(analyzed.dceAnalyzed).toBe(true);
    });

    it('should set status to ANALYZING when marking analyzed', () => {
      const tender = Tender.create(makeCreateParams());
      const analyzed = tender.markAnalyzed(65);
      expect(analyzed.status).toBe(TenderStatus.ANALYZING);
    });

    it('should return a new Tender instance (immutability)', () => {
      const tender = Tender.create(makeCreateParams());
      const analyzed = tender.markAnalyzed(50);
      expect(analyzed).not.toBe(tender);
      expect(tender.dceFitScore).toBeUndefined();
      expect(tender.dceAnalyzed).toBe(false);
    });
  });

  describe('toPlainObject()', () => {
    it('should serialize to plain object with all props', () => {
      const tender = Tender.create(makeCreateParams());
      const plain = tender.toPlainObject();
      expect(plain.id).toBe(tender.id);
      expect(plain.status).toBe(TenderStatus.DETECTED);
      expect(plain.source).toBe('BOAMP');
      expect(plain.title).toBe('Marché de services informatiques');
      expect(plain.dceAnalyzed).toBe(false);
      expect(plain.createdAt).toBeInstanceOf(Date);
    });

    it('should return a copy that does not affect original when mutated', () => {
      const tender = Tender.create(makeCreateParams());
      const plain = tender.toPlainObject();
      (plain as any).title = 'mutated';
      expect(tender.title).toBe('Marché de services informatiques');
    });
  });
});
