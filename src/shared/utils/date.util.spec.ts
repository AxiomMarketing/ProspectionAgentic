import { formatIso, isExpired, daysUntil, addDays } from './date.util';

describe('Date Utilities', () => {
  it('formatIso returns ISO string', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    expect(formatIso(date)).toBe('2026-01-15T10:30:00.000Z');
  });

  it('isExpired returns true for past date', () => {
    const past = new Date('2020-01-01');
    expect(isExpired(past)).toBe(true);
  });

  it('isExpired returns false for future date', () => {
    const future = new Date('2030-01-01');
    expect(isExpired(future)).toBe(false);
  });

  it('daysUntil returns positive for future date', () => {
    const future = addDays(new Date(), 10);
    expect(daysUntil(future)).toBeGreaterThanOrEqual(9);
    expect(daysUntil(future)).toBeLessThanOrEqual(11);
  });

  it('addDays adds correct number of days', () => {
    const base = new Date('2026-01-01');
    const result = addDays(base, 5);
    expect(result.getDate()).toBe(6);
  });
});
