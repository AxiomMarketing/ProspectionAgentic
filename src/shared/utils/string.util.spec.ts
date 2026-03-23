import { kebabCase, truncate, sanitizeForLog } from './string.util';

describe('String Utilities', () => {
  it('kebabCase converts camelCase', () => {
    expect(kebabCase('helloWorld')).toBe('hello-world');
  });

  it('kebabCase converts spaces', () => {
    expect(kebabCase('hello world test')).toBe('hello-world-test');
  });

  it('truncate shortens long strings', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncate preserves short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('sanitizeForLog removes newlines', () => {
    expect(sanitizeForLog('hello\nworld\ttab')).toBe('hello world tab');
  });
});
