import { createEEEntityLifecycleService } from './EEEntityLifecycle';

describe('EEEntityLifecycleService', () => {
  const credentials = {
    principal: { type: 'user', userEntityRef: 'user:default/alice' },
  } as any;
  const auth = {
    getPluginRequestToken: jest
      .fn()
      .mockResolvedValue({ token: 'catalog-user-token' }),
  } as any;
  const discovery = {
    getBaseUrl: jest
      .fn()
      .mockResolvedValue('http://catalog.example/api/catalog'),
  } as any;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: true, mode: 'location' }),
    } as Response);
  });

  afterEach(() => fetchMock.mockRestore());

  it('registers using caller credentials, not service credentials', async () => {
    const lifecycle = createEEEntityLifecycleService({ auth, discovery });
    const entity = { kind: 'Component', metadata: { name: 'sample' } } as any;

    await lifecycle.registerExecutionEnvironment(entity, credentials);

    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://catalog.example/api/catalog/ansible/ee',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer catalog-user-token',
        }),
      }),
    );
  });

  it('passes provider-managed cleanup intent and returns the catalog result', async () => {
    const lifecycle = createEEEntityLifecycleService({ auth, discovery });

    await expect(
      lifecycle.unregisterExecutionEnvironment('sample ee', credentials, {
        skipProviderManaged: true,
      }),
    ).resolves.toEqual({ mode: 'location' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://catalog.example/api/catalog/ansible/ee/sample%20ee?skipProviderManaged=true',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('surfaces failed catalog operations', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ error: 'Forbidden' }),
    } as Response);
    const lifecycle = createEEEntityLifecycleService({ auth, discovery });

    await expect(
      lifecycle.unregisterExecutionEnvironment('sample', credentials),
    ).rejects.toThrow('Failed to unregister Execution Environment: Forbidden');
  });
});
