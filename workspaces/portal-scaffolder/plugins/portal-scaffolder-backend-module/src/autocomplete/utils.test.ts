import { clearCollectionsCache, getCollections } from './utils';

describe('getCollections catalog filters', () => {
  const auth = {
    getOwnServiceCredentials: jest.fn().mockResolvedValue({}),
    getPluginRequestToken: jest.fn().mockResolvedValue({ token: 'catalog-token' }),
  } as any;
  const discovery = {
    getBaseUrl: jest.fn().mockResolvedValue('http://catalog.example.com'),
  } as any;
  const logger = { warn: jest.fn() } as any;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCollectionsCache();
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [],
    } as Response);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  async function requestedFilter(searchQuery: string): Promise<string> {
    await getCollections({ auth, discovery, logger, searchQuery });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    return requestedUrl.searchParams.get('filter') ?? '';
  }

  it('preserves allowed search fields and always adds the collection type filter', async () => {
    await expect(
      requestedFilter('kind=Component,metadata.name=ansible*'),
    ).resolves.toBe(
      'kind=Component,metadata.name=ansible*,spec.type=ansible-collection',
    );
  });

  it('does not let a client query containing the base filter replace it', async () => {
    await expect(
      requestedFilter(
        'kind=Component,metadata.name=spec.type=ansible-collection',
      ),
    ).resolves.toBe('kind=Component,spec.type=ansible-collection');
  });

  it('drops client-supplied spec.type filters and retains the required type', async () => {
    await expect(
      requestedFilter('spec.type=ansible-collection'),
    ).resolves.toBe('spec.type=ansible-collection');
  });
});
