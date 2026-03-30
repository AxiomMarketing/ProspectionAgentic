import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { HunterAdapter } from './hunter.adapter';

function makeAxiosResponse<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} as any };
}

describe('HunterAdapter', () => {
  let adapter: HunterAdapter;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;

  function buildAdapter(apiKey: string) {
    configService.get.mockImplementation((key: string, fallback?: any) => {
      if (key === 'HUNTER_API_KEY') return apiKey;
      return fallback;
    });
    return new HunterAdapter(httpService as any, configService as any);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HunterAdapter,
        {
          provide: HttpService,
          useValue: { get: jest.fn(), post: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    adapter = module.get<HunterAdapter>(HunterAdapter);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
  });

  describe('isAvailable', () => {
    it('returns true when API key is set', async () => {
      const a = buildAdapter('test-key');
      expect(await a.isAvailable()).toBe(true);
    });

    it('returns false when API key is empty', async () => {
      const a = buildAdapter('');
      expect(await a.isAvailable()).toBe(false);
    });
  });

  describe('domainSearch', () => {
    it('returns mapped contacts on success', async () => {
      const a = buildAdapter('test-key');
      httpService.get.mockReturnValueOnce(of(makeAxiosResponse({
        data: {
          emails: [
            {
              value: 'john.doe@example.com',
              confidence: 90,
              first_name: 'John',
              last_name: 'Doe',
              position: 'CMO',
              seniority: 'senior',
              department: 'marketing',
              linkedin: 'https://linkedin.com/in/johndoe',
            },
          ],
        },
      })));

      const result = await a.domainSearch('example.com');
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('john.doe@example.com');
      expect(result[0].confidence).toBe(90);
      expect(result[0].position).toBe('CMO');
      expect(result[0].linkedin_url).toBe('https://linkedin.com/in/johndoe');
    });

    it('returns empty array when no API key', async () => {
      const a = buildAdapter('');
      const result = await a.domainSearch('example.com');
      expect(result).toEqual([]);
    });

    it('returns empty array on 429 rate limit', async () => {
      const a = buildAdapter('test-key');
      const error = Object.assign(new Error('Rate limited'), { response: { status: 429 } });
      httpService.get.mockReturnValueOnce(throwError(() => error));

      const result = await a.domainSearch('example.com');
      expect(result).toEqual([]);
    });
  });

  describe('emailFinder', () => {
    it('returns result when email found', async () => {
      const a = buildAdapter('test-key');
      httpService.get.mockReturnValueOnce(of(makeAxiosResponse({
        data: { email: 'john@example.com', score: 88, position: 'CMO', linkedin_url: null },
      })));

      const result = await a.emailFinder('example.com', 'John', 'Doe');
      expect(result).not.toBeNull();
      expect(result!.email).toBe('john@example.com');
      expect(result!.score).toBe(88);
    });

    it('returns null when email not found', async () => {
      const a = buildAdapter('test-key');
      httpService.get.mockReturnValueOnce(of(makeAxiosResponse({
        data: { email: null },
      })));

      const result = await a.emailFinder('example.com', 'Unknown', 'Person');
      expect(result).toBeNull();
    });

    it('returns null when no API key', async () => {
      const a = buildAdapter('');
      const result = await a.emailFinder('example.com', 'John', 'Doe');
      expect(result).toBeNull();
    });

    it('returns null on HTTP error', async () => {
      const a = buildAdapter('test-key');
      httpService.get.mockReturnValueOnce(throwError(() => new Error('Network error')));

      const result = await a.emailFinder('example.com', 'John', 'Doe');
      expect(result).toBeNull();
    });
  });

  describe('emailVerifier', () => {
    it('returns verification result', async () => {
      const a = buildAdapter('test-key');
      httpService.get.mockReturnValueOnce(of(makeAxiosResponse({
        data: { status: 'valid', score: 95 },
      })));

      const result = await a.emailVerifier('john@example.com');
      expect(result.status).toBe('valid');
      expect(result.score).toBe(95);
    });

    it('returns unknown when no API key', async () => {
      const a = buildAdapter('');
      const result = await a.emailVerifier('john@example.com');
      expect(result.status).toBe('unknown');
      expect(result.score).toBe(0);
    });
  });

  describe('getCreditsRemaining', () => {
    it('returns available credits', async () => {
      const a = buildAdapter('test-key');
      httpService.get.mockReturnValueOnce(of(makeAxiosResponse({
        data: { calls: { available: 42 } },
      })));

      const result = await a.getCreditsRemaining();
      expect(result).toBe(42);
    });

    it('returns 0 when no API key', async () => {
      const a = buildAdapter('');
      const result = await a.getCreditsRemaining();
      expect(result).toBe(0);
    });
  });
});
