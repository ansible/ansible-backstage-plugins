import { AuthenticationError, NotAllowedError } from '@backstage/errors';
import {
  buildCollectionsFromCatalogEntities,
  clearCollectionsCache,
  getCollections,
} from './utils';

describe('getCollections catalog filters', () => {
  const auth = {
    authenticate: jest
      .fn()
      .mockImplementation(async (identityToken: string) => ({
        principal: {
          type: 'user',
          userEntityRef: `user:default/${identityToken}`,
        },
      })),
    isPrincipal: jest.fn(
      (credentials: any, type: string) => credentials.principal.type === type,
    ),
    getPluginRequestToken: jest
      .fn()
      .mockResolvedValue({ token: 'catalog-token' }),
  } as any;
  const discovery = {
    getBaseUrl: jest.fn().mockResolvedValue('http://catalog.example.com'),
  } as any;
  const logger = { warn: jest.fn() } as any;
  const callerCredentials = {
    principal: { type: 'user', userEntityRef: 'user:default/alice' },
  } as any;
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
    await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials,
      identityToken: 'alice',
      searchQuery,
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    return requestedUrl.searchParams.get('filter') ?? '';
  }

  it('preserves equality filters and always adds the collection type filter', async () => {
    await expect(
      requestedFilter('kind=Component,metadata.name=ansible.core'),
    ).resolves.toBe(
      'kind=Component,metadata.name=ansible.core,spec.type=ansible-collection',
    );
  });

  it('drops unsupported wildcard filters and returns catalog results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [
        {
          spec: {
            collection_full_name: 'ansible.core',
            collection_version: '2.0.0',
          },
        },
      ],
    } as Response);

    const { results } = await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials,
      identityToken: 'alice',
      searchQuery: 'kind=Component,metadata.name=ansible*',
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestedUrl.searchParams.get('filter')).toBe(
      'kind=Component,spec.type=ansible-collection',
    );
    expect(results.map(collection => collection.name)).toEqual([
      'ansible.core',
    ]);
  });

  it('does not let a client query containing the base filter replace it', async () => {
    await expect(
      requestedFilter(
        'kind=Component,metadata.name=spec.type=ansible-collection',
      ),
    ).resolves.toBe('kind=Component,spec.type=ansible-collection');
  });

  it('drops client-supplied spec.type filters and retains the required type', async () => {
    await expect(requestedFilter('spec.type=ansible-collection')).resolves.toBe(
      'spec.type=ansible-collection',
    );
  });

  it('requires a verified user token matching the caller credentials', async () => {
    await expect(
      getCollections({ auth, discovery, logger, callerCredentials }),
    ).rejects.toThrow(AuthenticationError);

    auth.authenticate.mockResolvedValueOnce({
      principal: { type: 'service' },
    });
    await expect(
      getCollections({
        auth,
        discovery,
        logger,
        callerCredentials,
        identityToken: 'service-token',
      }),
    ).rejects.toThrow(NotAllowedError);

    await expect(
      getCollections({
        auth,
        discovery,
        logger,
        callerCredentials,
        identityToken: 'bob',
      }),
    ).rejects.toThrow(NotAllowedError);

    expect(auth.getPluginRequestToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the verified caller credentials for catalog requests', async () => {
    await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials,
      identityToken: 'alice',
    });

    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: callerCredentials,
      targetPluginId: 'catalog',
    });
  });

  it('does not share cached catalog results between callers', async () => {
    await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials,
      identityToken: 'alice',
    });
    await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials: {
        principal: { type: 'user', userEntityRef: 'user:default/bob' },
      } as any,
      identityToken: 'bob',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not share cached results between visibility tokens for one caller', async () => {
    auth.authenticate
      .mockResolvedValueOnce(callerCredentials)
      .mockResolvedValueOnce(callerCredentials);

    await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials,
      identityToken: 'alice-visibility-a',
    });
    await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials,
      identityToken: 'alice-visibility-b',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest cache entry when the cache reaches its size limit', async () => {
    for (let index = 0; index <= 100; index++) {
      await getCollections({
        auth,
        discovery,
        logger,
        callerCredentials: {
          principal: {
            type: 'user',
            userEntityRef: `user:default/user-${index}`,
          },
        } as any,
        identityToken: `user-${index}`,
      });
    }

    await getCollections({
      auth,
      discovery,
      logger,
      callerCredentials: {
        principal: { type: 'user', userEntityRef: 'user:default/user-0' },
      } as any,
      identityToken: 'user-0',
    });

    expect(fetchMock).toHaveBeenCalledTimes(102);
  });

  it('uses the namespace/name fallback for a non-string full name', () => {
    expect(
      buildCollectionsFromCatalogEntities([
        {
          spec: {
            collection_full_name: { invalid: true },
            collection_namespace: 'ansible',
            collection_name: 'core',
          },
        },
      ]).map(collection => collection.name),
    ).toEqual(['ansible.core']);
  });

  it('uses a non-empty ref as the label when the version is empty', () => {
    const [collection] = buildCollectionsFromCatalogEntities([
      {
        spec: {
          collection_full_name: 'ansible.core',
          collection_version: '',
        },
        metadata: { annotations: { 'ansible.io/ref': 'release/1.0' } },
      },
    ]);

    expect(collection.versions?.[0]).toMatchObject({
      ref: 'release/1.0',
      version: '',
      label: 'release/1.0',
    });
  });

  it('bounds search query terms and length before building the catalog filter', async () => {
    const longValue = 'x'.repeat(600);
    const query = Array.from(
      { length: 12 },
      (_, index) => `metadata.name=${index}${longValue}`,
    ).join(',');

    await requestedFilter(query);

    const filter = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get(
      'filter',
    );
    expect(filter?.length).toBeLessThanOrEqual(600);
    expect(filter?.split(',').length).toBeLessThanOrEqual(2);
  });

  it('caps distinct in-flight catalog requests', async () => {
    const requests = Array.from({ length: 10 }, (_, index) =>
      getCollections({
        auth,
        discovery,
        logger,
        callerCredentials: {
          principal: {
            type: 'user',
            userEntityRef: `user:default/user-${index}`,
          },
        } as any,
        identityToken: `user-${index}`,
      }),
    );

    await expect(
      getCollections({
        auth,
        discovery,
        logger,
        callerCredentials: {
          principal: { type: 'user', userEntityRef: 'user:default/user-10' },
        } as any,
        identityToken: 'user-10',
      }),
    ).rejects.toThrow('Too many distinct collections requests are in progress');
    await expect(Promise.all(requests)).resolves.toHaveLength(10);
  });
});
