import { StartNurtureSchema } from './start-nurture.dto';

describe('StartNurtureSchema', () => {
  it('should accept base required fields', () => {
    const result = StartNurtureSchema.safeParse({
      prospectId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Scored as WARM',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional category', () => {
    const result = StartNurtureSchema.safeParse({
      prospectId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Scored as WARM',
      category: 'WARM',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe('WARM');
  });

  it('should accept optional routing', () => {
    const result = StartNurtureSchema.safeParse({
      prospectId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Scored as COLD',
      category: 'COLD',
      routing: {
        sequenceId: 'seq-cold',
        canal: 'email',
        slaHours: 72,
        priority: 10,
        delayMs: 3600000,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.routing?.sequenceId).toBe('seq-cold');
      expect(result.data.routing?.slaHours).toBe(72);
    }
  });

  it('should fail with invalid uuid', () => {
    const result = StartNurtureSchema.safeParse({
      prospectId: 'not-a-uuid',
      reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('should fail with missing reason', () => {
    const result = StartNurtureSchema.safeParse({
      prospectId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('should omit optional fields when not provided', () => {
    const result = StartNurtureSchema.safeParse({
      prospectId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Scored as WARM',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeUndefined();
      expect(result.data.routing).toBeUndefined();
    }
  });
});
