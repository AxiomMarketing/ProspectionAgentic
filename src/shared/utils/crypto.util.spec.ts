import { hashEmail, generateUuid } from './crypto.util';

describe('Crypto Utilities', () => {
  it('hashEmail produces consistent hash', () => {
    const hash1 = hashEmail('test@example.com', 'secret');
    const hash2 = hashEmail('test@example.com', 'secret');
    expect(hash1).toBe(hash2);
  });

  it('hashEmail is case-insensitive', () => {
    const hash1 = hashEmail('Test@Example.COM', 'secret');
    const hash2 = hashEmail('test@example.com', 'secret');
    expect(hash1).toBe(hash2);
  });

  it('hashEmail differs with different secrets', () => {
    const hash1 = hashEmail('test@example.com', 'secret1');
    const hash2 = hashEmail('test@example.com', 'secret2');
    expect(hash1).not.toBe(hash2);
  });

  it('generateUuid returns valid UUID format', () => {
    const uuid = generateUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
