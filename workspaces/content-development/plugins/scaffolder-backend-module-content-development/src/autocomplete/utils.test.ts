import { AuthenticationError, NotAllowedError } from '@backstage/errors';
import { clearCollectionsCache, getCollections } from './utils';

describe('getCollections catalog filters', () => {
  const auth = {
    authenticate: jest.fn().mockImplementation(async (token: string) => ({
      principal: { type: 'user', userEntityRef: `user:default/${token}` },
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
      searchQuery,
      identityToken: 'test-user',
    });
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
    await expect(requestedFilter('spec.type=ansible-collection')).resolves.toBe(
      'spec.type=ansible-collection',
    );
  });

  it('forwards verified user credentials to the catalog', async () => {
    const credentials = {
      principal: {
        type: 'user',
        userEntityRef: 'user:default/test-user',
      },
    };
    auth.authenticate.mockResolvedValueOnce(credentials);

    await getCollections({
      auth,
      discovery,
      logger,
      identityToken: 'verified-user-token',
    });

    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
  });

  it('rejects requests without a verified user token', async () => {
    await expect(getCollections({ auth, discovery, logger })).rejects.toThrow(
      AuthenticationError,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-user credentials', async () => {
    auth.authenticate.mockResolvedValueOnce({
      principal: { type: 'service' },
    });

    await expect(
      getCollections({ auth, discovery, logger, identityToken: 'service' }),
    ).rejects.toThrow(NotAllowedError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not share cached results between users', async () => {
    await getCollections({ auth, discovery, logger, identityToken: 'alice' });
    await getCollections({ auth, discovery, logger, identityToken: 'bob' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not share cached results across visibility tokens for one user', async () => {
    const credentials = {
      principal: {
        type: 'user',
        userEntityRef: 'user:default/alice',
      },
    };
    auth.authenticate
      .mockResolvedValueOnce(credentials)
      .mockResolvedValueOnce(credentials);

    await getCollections({
      auth,
      discovery,
      logger,
      identityToken: 'alice-with-visibility-a',
    });
    await getCollections({
      auth,
      discovery,
      logger,
      identityToken: 'alice-with-visibility-b',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not share in-flight lookups between users', async () => {
    const finishFetches: Array<(response: Response) => void> = [];
    let resolveBothFetches!: () => void;
    const bothFetchesStarted = new Promise<void>(resolve => {
      resolveBothFetches = resolve;
    });
    fetchMock.mockImplementation(
      () =>
        new Promise(resolve => {
          finishFetches.push(resolve);
          if (finishFetches.length === 2) resolveBothFetches();
        }),
    );

    const aliceRequest = getCollections({
      auth,
      discovery,
      logger,
      identityToken: 'alice',
    });
    const bobRequest = getCollections({
      auth,
      discovery,
      logger,
      identityToken: 'bob',
    });

    await bothFetchesStarted;
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [],
    } as Response;
    finishFetches.forEach(finishFetch => finishFetch(response));
    await Promise.all([aliceRequest, bobRequest]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not share in-flight lookups across visibility tokens for one user', async () => {
    const credentials = {
      principal: {
        type: 'user',
        userEntityRef: 'user:default/alice',
      },
    };
    auth.authenticate
      .mockResolvedValueOnce(credentials)
      .mockResolvedValueOnce(credentials);

    const finishFetches: Array<(response: Response) => void> = [];
    let resolveBothFetches!: () => void;
    const bothFetchesStarted = new Promise<void>(resolve => {
      resolveBothFetches = resolve;
    });
    fetchMock.mockImplementation(
      () =>
        new Promise(resolve => {
          finishFetches.push(resolve);
          if (finishFetches.length === 2) resolveBothFetches();
        }),
    );

    const firstRequest = getCollections({
      auth,
      discovery,
      logger,
      identityToken: 'alice-with-visibility-a',
    });
    const secondRequest = getCollections({
      auth,
      discovery,
      logger,
      identityToken: 'alice-with-visibility-b',
    });

    await bothFetchesStarted;
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [],
    } as Response;
    finishFetches.forEach(finishFetch => finishFetch(response));
    await Promise.all([firstRequest, secondRequest]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
