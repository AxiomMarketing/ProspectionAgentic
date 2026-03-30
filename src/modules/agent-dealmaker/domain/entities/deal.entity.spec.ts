import { Deal, DealStage } from './deal.entity';

describe('Deal entity', () => {
  function makeQualification(): Deal {
    return Deal.create({
      prospectId: 'aaa00000-0000-0000-0000-000000000001',
      title: 'Test deal',
      amountEur: 5000,
    });
  }

  describe('create()', () => {
    it('starts in QUALIFICATION stage', () => {
      const deal = makeQualification();
      expect(deal.stage).toBe(DealStage.QUALIFICATION);
    });

    it('initialises stageHistory with QUALIFICATION entry', () => {
      const deal = makeQualification();
      expect(deal.stageHistory).toHaveLength(1);
      expect(deal.stageHistory[0].stage).toBe(DealStage.QUALIFICATION);
    });

    it('assigns a UUID id', () => {
      const deal = makeQualification();
      expect(deal.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('advanceStage()', () => {
    it('transitions QUALIFICATION → DEVIS_CREE', () => {
      const deal = makeQualification().advanceStage(DealStage.DEVIS_CREE);
      expect(deal.stage).toBe(DealStage.DEVIS_CREE);
    });

    it('appends entry to stageHistory on transition', () => {
      const deal = makeQualification().advanceStage(DealStage.DEVIS_CREE);
      expect(deal.stageHistory).toHaveLength(2);
      expect(deal.stageHistory[1].stage).toBe(DealStage.DEVIS_CREE);
    });

    it('throws on invalid transition (QUALIFICATION → NEGOCIATION)', () => {
      expect(() => makeQualification().advanceStage(DealStage.NEGOCIATION)).toThrow(
        /Invalid transition/,
      );
    });

    it('throws when trying to advance to GAGNE via advanceStage()', () => {
      const deal = makeQualification()
        .advanceStage(DealStage.DEVIS_CREE)
        .advanceStage(DealStage.DEVIS_EN_CONSIDERATION)
        .advanceStage(DealStage.NEGOCIATION)
        .advanceStage(DealStage.SIGNATURE_EN_COURS);
      expect(() => deal.advanceStage(DealStage.GAGNE)).toThrow(/Use close\(\)/);
    });

    it('throws when trying to advance to PERDU via advanceStage()', () => {
      expect(() => makeQualification().advanceStage(DealStage.PERDU)).toThrow(/Use close\(\)/);
    });
  });

  describe('close()', () => {
    function makeSignature(): Deal {
      return makeQualification()
        .advanceStage(DealStage.DEVIS_CREE)
        .advanceStage(DealStage.DEVIS_EN_CONSIDERATION)
        .advanceStage(DealStage.NEGOCIATION)
        .advanceStage(DealStage.SIGNATURE_EN_COURS);
    }

    it('sets stage to GAGNE when won=true', () => {
      const closed = makeSignature().close(true, 'Great client');
      expect(closed.stage).toBe(DealStage.GAGNE);
    });

    it('sets wonReason when won=true', () => {
      const closed = makeSignature().close(true, 'Great client');
      expect(closed.wonReason).toBe('Great client');
      expect(closed.lostReason).toBeUndefined();
    });

    it('sets stage to PERDU when won=false', () => {
      const closed = makeSignature().close(false, 'Budget cut');
      expect(closed.stage).toBe(DealStage.PERDU);
    });

    it('sets lostReason when won=false', () => {
      const closed = makeSignature().close(false, 'Budget cut');
      expect(closed.lostReason).toBe('Budget cut');
      expect(closed.wonReason).toBeUndefined();
    });

    it('sets closedAt on close()', () => {
      const before = new Date();
      const closed = makeSignature().close(true, 'Won');
      expect(closed.closedAt).toBeInstanceOf(Date);
      expect(closed.closedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('throws when closing from QUALIFICATION (invalid transition)', () => {
      expect(() => makeQualification().close(true, 'Won')).toThrow(/Invalid transition/);
    });

    it('throws when closing an already closed deal (GAGNE)', () => {
      const won = makeSignature().close(true, 'Won');
      expect(() => won.close(false, 'Oops')).toThrow(/Invalid transition/);
    });
  });

  describe('toPlainObject()', () => {
    it('returns a plain copy with immutable stageHistory', () => {
      const deal = makeQualification();
      const plain = deal.toPlainObject();
      plain.stageHistory.push({ stage: DealStage.PERDU, enteredAt: new Date() });
      expect(deal.stageHistory).toHaveLength(1);
    });
  });
});
