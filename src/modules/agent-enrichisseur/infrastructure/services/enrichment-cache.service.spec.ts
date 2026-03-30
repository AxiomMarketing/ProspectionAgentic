import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnrichmentCacheService } from './enrichment-cache.service';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => mockRedis);
  return { __esModule: true, default: MockRedis };
});

describe('EnrichmentCacheService', () => {
  let service: EnrichmentCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrichmentCacheService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('redis://localhost:6379') },
        },
      ],
    }).compile();

    service = module.get<EnrichmentCacheService>(EnrichmentCacheService);
  });

  describe('get', () => {
    it('returns null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('some:key');
      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('some:key');
    });

    it('returns parsed JSON on cache hit', async () => {
      const value = { siren: '123456789', legalName: 'Test SAS' };
      mockRedis.get.mockResolvedValue(JSON.stringify(value));
      const result = await service.get<typeof value>('enrichment:insee:123456789');
      expect(result).toEqual(value);
    });

    it('returns null when Redis throws', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));
      const result = await service.get('some:key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('stores JSON-serialized value with EX ttl', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const value = { siren: '123456789' };
      await service.set('enrichment:pappers:123456789', value, 2_592_000);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'enrichment:pappers:123456789',
        JSON.stringify(value),
        'EX',
        2_592_000,
      );
    });

    it('does not throw when Redis set fails', async () => {
      mockRedis.set.mockRejectedValue(new Error('Connection refused'));
      await expect(service.set('some:key', { data: 1 }, 60)).resolves.toBeUndefined();
    });
  });

  describe('invalidate', () => {
    it('deletes the key', async () => {
      mockRedis.del.mockResolvedValue(1);
      await service.invalidate('enrichment:insee:123456789');
      expect(mockRedis.del).toHaveBeenCalledWith('enrichment:insee:123456789');
    });

    it('does not throw when Redis del fails', async () => {
      mockRedis.del.mockRejectedValue(new Error('Connection refused'));
      await expect(service.invalidate('some:key')).resolves.toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('disconnects Redis', () => {
      service.onModuleDestroy();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });
});
