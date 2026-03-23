import { SequenceOrchestratorService } from './sequence-orchestrator.service';

describe('SequenceOrchestratorService', () => {
  let service: SequenceOrchestratorService;

  beforeEach(() => {
    service = new SequenceOrchestratorService();
  });

  // ---- HOT sequence delays ----

  it('HOT sequence step 0→1 should have delay of 2 days', () => {
    const result = service.getNextStepDelay('seq_hot_a_vip', 0);
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    expect(result.delayMs).toBe(twoDaysMs);
    expect(result.hasNextStep).toBe(true);
  });

  it('HOT sequence step 1→2 should have delay of 3 days (5-2)', () => {
    const result = service.getNextStepDelay('seq_hot_a_vip', 1);
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(result.delayMs).toBe(threeDaysMs);
    expect(result.hasNextStep).toBe(true);
  });

  it('HOT sequence step 2→3 should have delay of 5 days (10-5)', () => {
    const result = service.getNextStepDelay('seq_hot_a_vip', 2);
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    expect(result.delayMs).toBe(fiveDaysMs);
    expect(result.hasNextStep).toBe(true);
  });

  // ---- WARM sequence ----

  it('WARM sequence step 0→1 should have delay of 3 days', () => {
    const result = service.getNextStepDelay('seq_warm_nurture', 0);
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(result.delayMs).toBe(threeDaysMs);
    expect(result.hasNextStep).toBe(true);
  });

  // ---- hasNextStep ----

  it('should return hasNextStep = false at last step of HOT sequence (step 3)', () => {
    const result = service.getNextStepDelay('seq_hot_a_vip', 3);
    expect(result.hasNextStep).toBe(false);
  });

  it('should return hasNextStep = false at last step of COLD sequence (step 6)', () => {
    const result = service.getNextStepDelay('seq_cold_newsletter', 6);
    expect(result.hasNextStep).toBe(false);
  });

  // ---- calculateSendTime ----

  it('calculateSendTime should return a weekday (not Saturday or Sunday)', () => {
    // Test over several seeds to cover weekend edge cases
    for (let i = 0; i < 10; i++) {
      const base = new Date('2026-03-21T12:00:00Z'); // Saturday
      const sendTime = service.calculateSendTime(base);
      const day = sendTime.getDay();
      expect(day).not.toBe(0); // Sunday
      expect(day).not.toBe(6); // Saturday
    }
  });

  it('calculateSendTime should set hours between 8 and 10', () => {
    const base = new Date('2026-03-23T00:00:00Z'); // Monday
    for (let i = 0; i < 5; i++) {
      const sendTime = service.calculateSendTime(base);
      expect(sendTime.getHours()).toBeGreaterThanOrEqual(8);
      expect(sendTime.getHours()).toBeLessThanOrEqual(10);
    }
  });

  // ---- isBusinessHours ----

  it('isBusinessHours should return a boolean', () => {
    const result = service.isBusinessHours();
    expect(typeof result).toBe('boolean');
  });

  it('should fall back to WARM sequence for unknown sequenceId', () => {
    // seq_warm_nurture is the fallback; any unknown id should behave the same
    const fallback = service.getNextStepDelay('seq_unknown_xyz', 0);
    const warm = service.getNextStepDelay('seq_warm_nurture', 0);
    expect(fallback.delayMs).toBe(warm.delayMs);
  });
});
