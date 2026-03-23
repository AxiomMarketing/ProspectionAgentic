import { MessageValidatorService } from './message-validator.service';

// Helper that generates a string of `n` words
function words(n: number): string {
  return Array.from({ length: n }, () => 'mot').join(' ');
}

// Helper that generates a string of exactly `n` characters
function chars(n: number): string {
  return 'a'.repeat(n);
}

describe('MessageValidatorService', () => {
  let service: MessageValidatorService;

  beforeEach(() => {
    service = new MessageValidatorService();
  });

  it('should pass for a valid message (70 words, 40 char subject)', () => {
    const subject = chars(40);
    const body = words(70);
    const result = service.validate(subject, body);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when body is too short (< 50 words)', () => {
    const subject = chars(40);
    const body = words(30);
    const result = service.validate(subject, body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('too short'))).toBe(true);
  });

  it('should fail when body is too long (> 125 words)', () => {
    const subject = chars(40);
    const body = words(130);
    const result = service.validate(subject, body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('too long'))).toBe(true);
  });

  it('should fail when subject is too short (< 36 chars)', () => {
    const subject = chars(20);
    const body = words(70);
    const result = service.validate(subject, body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Subject too short'))).toBe(true);
  });

  it('should fail when subject is too long (> 50 chars)', () => {
    const subject = chars(55);
    const body = words(70);
    const result = service.validate(subject, body);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Subject too long'))).toBe(true);
  });

  it('should fail and list spam words when body contains spam words', () => {
    const subject = chars(40);
    const body = words(65) + ' gratuit urgent';
    const result = service.validate(subject, body);
    expect(result.valid).toBe(false);
    const spamError = result.errors.find((e) => e.includes('Spam words'));
    expect(spamError).toBeDefined();
    expect(spamError).toContain('gratuit');
    expect(spamError).toContain('urgent');
  });

  it('should detect spam words case-insensitively', () => {
    const subject = chars(40);
    const body = words(65) + ' GRATUIT';
    const result = service.validate(subject, body);
    const spamError = result.errors.find((e) => e.includes('Spam words'));
    expect(spamError).toBeDefined();
  });

  it('should accumulate multiple errors', () => {
    const subject = chars(10); // too short
    const body = words(20); // too short
    const result = service.validate(subject, body);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
