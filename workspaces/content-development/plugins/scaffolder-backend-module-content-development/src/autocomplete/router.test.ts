import { createCollectionsAutocompleteRouter } from './router';

describe('collections autocomplete route', () => {
  const credentials = {
    principal: { type: 'user', userEntityRef: 'user:default/alice' },
  } as any;
  const auth = {
    getPluginRequestToken: jest
      .fn()
      .mockResolvedValue({ token: 'catalog-token' }),
  } as any;
  const discovery = {
    getBaseUrl: jest
      .fn()
      .mockResolvedValue('http://catalog.example/api/catalog'),
  } as any;
  const httpAuth = {
    credentials: jest.fn().mockResolvedValue(credentials),
  } as any;
  const logger = { warn: jest.fn() } as any;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
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
  });

  afterEach(() => fetchMock.mockRestore());

  it('requires a user identity and makes caller-scoped catalog requests', async () => {
    const router = createCollectionsAutocompleteRouter({
      auth,
      discovery,
      httpAuth,
      logger,
    });
    const handler = (router as any).stack[0].route.stack[0].handle;
    const response = { json: jest.fn() };
    const next = jest.fn();
    await handler({ method: 'GET', query: {} }, response, next);

    expect(
      response.json.mock.calls[0][0].results.map(
        (item: { name: string }) => item.name,
      ),
    ).toEqual(['ansible.core']);
    expect(httpAuth.credentials).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET' }),
      { allow: ['user'] },
    );
    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
  });

  it('does not query catalog when authentication fails', async () => {
    httpAuth.credentials.mockRejectedValueOnce(new Error('Unauthorized'));
    const router = createCollectionsAutocompleteRouter({
      auth,
      discovery,
      httpAuth,
      logger,
    });
    const handler = (router as any).stack[0].route.stack[0].handle;
    const next = jest.fn();
    await handler({ method: 'GET', query: {} }, {}, next);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
