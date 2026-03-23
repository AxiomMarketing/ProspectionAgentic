import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  describe('with simple schema', () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
    });

    let pipe: ZodValidationPipe<{ name: string; age: number }>;

    beforeEach(() => {
      pipe = new ZodValidationPipe(schema);
    });

    it('passes valid input through unchanged', () => {
      const input = { name: 'Alice', age: 30 };
      const result = pipe.transform(input);
      expect(result).toEqual(input);
    });

    it('throws BadRequestException for invalid input', () => {
      expect(() => pipe.transform({ name: '', age: 30 })).toThrow(BadRequestException);
    });

    it('throws BadRequestException with VALIDATION_ERROR code', () => {
      try {
        pipe.transform({ name: 'Alice', age: -1 });
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('VALIDATION_ERROR');
        expect(response.message).toBe('Validation failed');
      }
    });

    it('error message contains field paths', () => {
      try {
        pipe.transform({ name: '', age: 'not-a-number' });
        fail('should have thrown');
      } catch (err) {
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        const errors = response.errors as Record<string, string[]>;
        expect(Object.keys(errors)).toContain('name');
      }
    });

    it('returns the parsed/transformed value', () => {
      // Schema with default value — zod applies defaults
      const schemaWithDefault = z.object({
        name: z.string(),
        count: z.number().default(10),
      });
      const pipeWithDefault = new ZodValidationPipe(schemaWithDefault);
      const result = pipeWithDefault.transform({ name: 'test' });
      expect(result).toEqual({ name: 'test', count: 10 });
    });
  });

  describe('with nested object schema', () => {
    const nestedSchema = z.object({
      user: z.object({
        email: z.string().email(),
        address: z.object({
          city: z.string().min(1),
        }),
      }),
    });

    let pipe: ZodValidationPipe<unknown>;

    beforeEach(() => {
      pipe = new ZodValidationPipe(nestedSchema);
    });

    it('validates nested objects successfully', () => {
      const valid = {
        user: { email: 'test@example.com', address: { city: 'Paris' } },
      };
      expect(() => pipe.transform(valid)).not.toThrow();
    });

    it('throws for invalid nested email', () => {
      expect(() =>
        pipe.transform({
          user: { email: 'not-an-email', address: { city: 'Paris' } },
        }),
      ).toThrow(BadRequestException);
    });

    it('error contains nested field path', () => {
      try {
        pipe.transform({
          user: { email: 'bad-email', address: { city: 'Paris' } },
        });
        fail('should have thrown');
      } catch (err) {
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        const errors = response.errors as Record<string, string[]>;
        // Path should be "user.email"
        expect(Object.keys(errors)).toContain('user.email');
      }
    });

    it('error contains deeply nested field path', () => {
      try {
        pipe.transform({
          user: { email: 'test@example.com', address: { city: '' } },
        });
        fail('should have thrown');
      } catch (err) {
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        const errors = response.errors as Record<string, string[]>;
        expect(Object.keys(errors)).toContain('user.address.city');
      }
    });
  });

  describe('with array schema', () => {
    const arraySchema = z.object({
      tags: z.array(z.string()).min(1),
    });

    it('validates valid array input', () => {
      const pipe = new ZodValidationPipe(arraySchema);
      expect(() => pipe.transform({ tags: ['a', 'b'] })).not.toThrow();
    });

    it('throws for empty array when min(1) required', () => {
      const pipe = new ZodValidationPipe(arraySchema);
      expect(() => pipe.transform({ tags: [] })).toThrow(BadRequestException);
    });
  });

  describe('with root-level schema error', () => {
    it('uses _root path for root-level errors', () => {
      const stringSchema = z.string().min(5);
      const pipe = new ZodValidationPipe(stringSchema);

      try {
        pipe.transform('hi');
        fail('should have thrown');
      } catch (err) {
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        const errors = response.errors as Record<string, string[]>;
        expect(Object.keys(errors)).toContain('_root');
      }
    });
  });
});
