import { InseeAdapter } from './insee.adapter';
import { of, throwError } from 'rxjs';

const mockHttpService = {
  get: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-token'),
};

const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  invalidate: jest.fn().mockResolvedValue(undefined),
};

describe('InseeAdapter', () => {
  let adapter: InseeAdapter;

  beforeEach(() => {
    adapter = new InseeAdapter(mockHttpService as any, mockConfigService as any, mockCache as any);
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('test-token');
    mockCache.get.mockResolvedValue(null);
  });

  it('searchBySiren returns company data', async () => {
    mockHttpService.get.mockReturnValue(
      of({
        data: {
          uniteLegale: {
            siren: '123456789',
            dateCreationUniteLegale: '2020-01-01',
            periodesUniteLegale: [
              {
                denominationUniteLegale: 'Test Corp',
                activitePrincipaleUniteLegale: '6201Z',
                etatAdministratifUniteLegale: 'A',
              },
            ],
          },
        },
      }),
    );

    const result = await adapter.searchBySiren('123456789');
    expect(result).not.toBeNull();
    expect(result!.legalName).toBe('Test Corp');
    expect(result!.isActive).toBe(true);
  });

  it('searchBySiren returns null on 404', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => ({ response: { status: 404 } })));
    const result = await adapter.searchBySiren('000000000');
    expect(result).toBeNull();
  });

  it('returns null when token not configured', async () => {
    const noTokenAdapter = new InseeAdapter(mockHttpService as any, { get: () => '' } as any, mockCache as any);
    const result = await noTokenAdapter.searchBySiren('123');
    expect(result).toBeNull();
  });

  it('isAvailable returns false when no token', async () => {
    const noTokenAdapter = new InseeAdapter(mockHttpService as any, { get: () => '' } as any, mockCache as any);
    expect(await noTokenAdapter.isAvailable()).toBe(false);
  });
});
