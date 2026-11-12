import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { EEEntityLifecycleAdapter } from './eeEntityLifecycleAdapter';

describe('EEEntityLifecycleAdapter', () => {
  const credentials = {} as any;
  const auth = {
    getPluginRequestToken: jest
      .fn()
      .mockResolvedValue({ token: 'catalog-token' }),
    getOwnServiceCredentials: jest.fn(),
  } as any;
  const permissions = {
    authorize: jest.fn().mockResolvedValue([{ result: AuthorizeResult.ALLOW }]),
  } as any;
  const provider = { register: jest.fn(), unregister: jest.fn() } as any;
  const catalog = {
    getEntityByRef: jest.fn(),
    getLocationByEntity: jest.fn(),
    removeEntityByUid: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('uses service credentials only to confirm a caller-visible absence during registration', async () => {
    catalog.getEntityByRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      provider,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await adapter.registerExecutionEnvironment(
      { kind: 'Component', metadata: { name: 'my-ee' } },
      credentials,
    );

    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    expect(auth.getOwnServiceCredentials).toHaveBeenCalledTimes(1);
    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: { principal: { type: 'service', subject: 'catalog' } },
      targetPluginId: 'catalog',
    });
    expect(provider.register).toHaveBeenCalled();
  });

  it('denies registration when the caller lacks create permission', async () => {
    permissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);
    const adapter = new EEEntityLifecycleAdapter(
      provider,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.registerExecutionEnvironment(
        { kind: 'Component', metadata: { name: 'my-ee' } },
        credentials,
      ),
    ).rejects.toThrow('Forbidden: insufficient permissions to create entity');

    expect(catalog.getEntityByRef).not.toHaveBeenCalled();
    expect(provider.register).not.toHaveBeenCalled();
  });

  it('requires caller delete permission before replacing an entity hidden from that caller', async () => {
    catalog.getEntityByRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        kind: 'Component',
        spec: { type: 'execution-environment' },
        metadata: { name: 'my-ee' },
      });
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    permissions.authorize
      .mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }])
      .mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
    const adapter = new EEEntityLifecycleAdapter(
      provider,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.registerExecutionEnvironment(
        { kind: 'Component', metadata: { name: 'my-ee' } },
        credentials,
      ),
    ).rejects.toThrow(
      'Forbidden: insufficient permissions to replace existing entity',
    );

    expect(permissions.authorize).toHaveBeenNthCalledWith(
      2,
      [
        expect.objectContaining({
          permission: expect.objectContaining({
            name: 'catalog.entity.delete',
          }),
          resourceRef: 'component:default/my-ee',
        }),
      ],
      { credentials },
    );
    expect(provider.register).not.toHaveBeenCalled();
  });

  it('denies cleanup when the caller lacks delete permission', async () => {
    catalog.getEntityByRef.mockResolvedValue({
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: { name: 'my-ee', uid: 'uid' },
    });
    permissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);
    const adapter = new EEEntityLifecycleAdapter(
      provider,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).rejects.toThrow('Forbidden: insufficient permissions to delete entity');

    expect(provider.unregister).not.toHaveBeenCalled();
    expect(catalog.getLocationByEntity).not.toHaveBeenCalled();
    expect(catalog.removeEntityByUid).not.toHaveBeenCalled();
  });

  it('does not report noop when cleanup cannot read an existing entity', async () => {
    catalog.getEntityByRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        kind: 'Component',
        spec: { type: 'execution-environment' },
        metadata: { name: 'my-ee' },
      });
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      provider,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).rejects.toThrow(
      'Insufficient permissions to read existing execution environment.',
    );
    expect(permissions.authorize).not.toHaveBeenCalled();
    expect(provider.unregister).not.toHaveBeenCalled();
  });

  it('skips provider cleanup for provider-managed entities when requested', async () => {
    catalog.getEntityByRef.mockResolvedValue({
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: {
        name: 'my-ee',
        uid: 'uid',
        annotations: { 'ansible.io/download-experience': 'true' },
      },
    });
    const adapter = new EEEntityLifecycleAdapter(
      provider,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials, {
        skipProviderManaged: true,
      }),
    ).resolves.toEqual({ mode: 'provider' });

    expect(provider.unregister).not.toHaveBeenCalled();
    expect(catalog.removeEntityByUid).not.toHaveBeenCalled();
  });

  it('does not suppress a failed entity removal when the entity remains', async () => {
    const entity = {
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: { name: 'my-ee', uid: 'uid' },
    };
    catalog.getEntityByRef.mockResolvedValue(entity);
    catalog.getLocationByEntity.mockResolvedValue(undefined);
    catalog.removeEntityByUid = jest
      .fn()
      .mockRejectedValue(new Error('catalog failed'));
    const adapter = new EEEntityLifecycleAdapter(
      provider,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).rejects.toThrow('catalog failed');
  });
});
