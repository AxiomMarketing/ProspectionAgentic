import { NurtureSequence } from './nurture-sequence.entity';

const makeSequence = (overrides: Partial<any> = {}) =>
  NurtureSequence.reconstitute({
    id: 'seq-1',
    prospectId: 'p-1',
    entryReason: 'warm',
    entryDate: new Date(),
    status: 'active',
    tags: [],
    currentStep: 0,
    totalSteps: 12,
    journeyStage: 'awareness',
    engagementScoreInitial: 0,
    engagementScoreCurrent: 0,
    emailsNurtureSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    repliesReceived: 0,
    contentDownloaded: 0,
    consecutiveUnopened: 0,
    consentBasis: 'legitimate_interest',
    ...overrides,
  });

describe('NurtureSequence entity', () => {
  describe('state machine', () => {
    it('active→paused is allowed', () => {
      const seq = makeSequence({ status: 'active' });
      const paused = seq.pause();
      expect(paused.status).toBe('paused');
    });

    it('active→exited is allowed', () => {
      const seq = makeSequence({ status: 'active' });
      const exited = seq.exit('test_reason');
      expect(exited.status).toBe('exited');
    });

    it('paused→active (reactivate) is allowed', () => {
      const seq = makeSequence({ status: 'paused' });
      const reactivated = seq.reactivate();
      expect(reactivated.status).toBe('reactivated');
    });

    it('exited→pause throws', () => {
      const seq = makeSequence({ status: 'exited' });
      expect(() => seq.pause()).toThrow();
    });

    it('exited→exit throws', () => {
      const seq = makeSequence({ status: 'exited' });
      expect(() => seq.exit('double_exit')).toThrow();
    });

    it('paused→exited is allowed', () => {
      const seq = makeSequence({ status: 'paused' });
      const exited = seq.exit('manual');
      expect(exited.status).toBe('exited');
      expect(exited.exitReason).toBe('manual');
    });
  });

  describe('incrementStep', () => {
    it('advances step by 1', () => {
      const seq = makeSequence({ currentStep: 3 });
      const advanced = seq.incrementStep();
      expect(advanced.currentStep).toBe(4);
    });

    it('does not exceed totalSteps', () => {
      const seq = makeSequence({ currentStep: 12, totalSteps: 12 });
      const advanced = seq.incrementStep();
      expect(advanced.currentStep).toBe(12);
    });

    it('journey stage changes at step 5 threshold', () => {
      const at4 = makeSequence({ currentStep: 4 });
      const at5 = at4.incrementStep();
      expect(at5.currentStep).toBe(5);
    });
  });

  describe('addReason', () => {
    it('merges reasons with semicolon separator', () => {
      const seq = makeSequence({ entryReason: 'first' });
      const updated = seq.addReason('second');
      expect(updated.entryReason).toBe('first; second');
    });

    it('uses new reason when existing reason is empty', () => {
      const seq = makeSequence({ entryReason: '' });
      const updated = seq.addReason('only-reason');
      expect(updated.entryReason).toBe('only-reason');
    });

    it('does not mutate original', () => {
      const seq = makeSequence({ entryReason: 'original' });
      seq.addReason('new');
      expect(seq.entryReason).toBe('original');
    });
  });

  describe('NurtureSequence.create', () => {
    it('creates with active status and awareness stage', () => {
      const seq = NurtureSequence.create('p-1', 'entry_warm');
      expect(seq.status).toBe('active');
      expect(seq.journeyStage).toBe('awareness');
      expect(seq.currentStep).toBe(0);
    });
  });
});
