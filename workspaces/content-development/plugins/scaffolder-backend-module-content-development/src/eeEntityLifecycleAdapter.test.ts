import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  EEEntityLifecycleAdapter,
  eeEntityLifecycleServiceFactory,
} from './eeEntityLifecycleAdapter';

const providerId = 'content-management.execution-environments';

describe('EEEntityLifecycleAdapter', () => {
  let registrationState: 'none' | 'pending' | 'registered' = 'none';
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
  const lockContext = {
    assertLockHeld: jest.fn(),
    beginMutation: jest.fn(async () => {}),
    beginRegistrationMutation: jest.fn(async () => {
      registrationState = 'pending';
    }),
    completeRegistration: jest.fn(async () => {
      registrationState = 'registered';
    }),
    clearRegistration: jest.fn(async () => {
      registrationState = 'none';
    }),
    get registrationState() {
      return registrationState;
    },
  };
  let activeEntityRef = '';
  const provider = {
    register: jest.fn(),
    unregister: jest.fn(),
    isReady: jest.fn(() => true),
    withEntityMutation: jest.fn(),
  } as any;
  const providers = { get: jest.fn(() => provider) } as any;
  const mutation = {
    assertLockHeld: jest.fn(),
    get registrationState() {
      return lockContext.registrationState;
    },
    upsert: jest.fn(async (entity: unknown) => {
      await lockContext.beginRegistrationMutation();
      await provider.register(entity);
      await lockContext.completeRegistration();
    }),
    remove: jest.fn(async () => {
      await lockContext.beginMutation();
      await provider.unregister(activeEntityRef.split('/').at(-1));
      await lockContext.clearRegistration();
    }),
    clearRegistration: jest.fn(async () => {
      await lockContext.beginMutation();
      await lockContext.clearRegistration();
    }),
  };
  const catalog = {
    getEntityByRef: jest.fn(),
    getLocationByEntity: jest.fn(),
    removeEntityByUid: jest.fn(),
    getEntities: jest.fn(),
    removeLocationById: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    registrationState = 'none';
    provider.withEntityMutation.mockImplementation(
      (
        { entityRef }: { entityRef: string },
        operation: (context: typeof mutation) => unknown,
      ) => {
        activeEntityRef = entityRef;
        return operation(mutation);
      },
    );
  });

  it('uses service credentials only to confirm a caller-visible absence during registration', async () => {
    catalog.getEntityByRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
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
      providers,
      providerId,
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
      providers,
      providerId,
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

  it('requires delete permission when retrying a pending registration without a catalog entity', async () => {
    registrationState = 'pending';
    catalog.getEntityByRef.mockResolvedValue(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });

    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await adapter.registerExecutionEnvironment(
      { kind: 'Component', metadata: { name: 'my-ee' } },
      credentials,
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
    expect(lockContext.beginRegistrationMutation).toHaveBeenCalledTimes(1);
    expect(provider.register).toHaveBeenCalledTimes(1);
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
      providers,
      providerId,
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
      providers,
      providerId,
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

  it('removes a pending registration even when the catalog entity is absent', async () => {
    registrationState = 'pending';
    catalog.getEntityByRef.mockResolvedValue(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });

    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).resolves.toEqual({ mode: 'provider' });

    expect(permissions.authorize).toHaveBeenCalledWith(
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
    expect(lockContext.beginMutation).toHaveBeenCalledTimes(1);
    expect(provider.unregister).toHaveBeenCalledWith('my-ee');
    expect(lockContext.clearRegistration).toHaveBeenCalledTimes(1);
    expect(registrationState).toBe('none');
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
      providers,
      providerId,
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

  it('skips cleanup for a hidden provider-managed pending registration', async () => {
    registrationState = 'pending';
    catalog.getEntityByRef.mockResolvedValueOnce(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    catalog.getEntityByRef.mockResolvedValueOnce({
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: {
        name: 'my-ee',
        annotations: { 'ansible.io/download-experience': 'true' },
      },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
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

    expect(permissions.authorize).toHaveBeenCalled();
    expect(provider.unregister).not.toHaveBeenCalled();
    expect(lockContext.beginMutation).not.toHaveBeenCalled();
    expect(lockContext.clearRegistration).not.toHaveBeenCalled();
  });

  it('preserves tracked provider registration when catalog visibility is delayed', async () => {
    registrationState = 'pending';
    catalog.getEntityByRef.mockResolvedValue(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
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

    expect(permissions.authorize).toHaveBeenCalledWith(
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
    expect(provider.unregister).not.toHaveBeenCalled();
    expect(lockContext.beginMutation).not.toHaveBeenCalled();
    expect(lockContext.clearRegistration).not.toHaveBeenCalled();
    expect(registrationState).toBe('pending');
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
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).rejects.toThrow('catalog failed');
  });

  it('rejects cleanup for a malformed execution environment name', async () => {
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    expect(() =>
      adapter.unregisterExecutionEnvironment('bad name!', credentials),
    ).toThrow('Invalid execution environment name.');
    expect(provider.withEntityMutation).not.toHaveBeenCalled();
  });

  it('reports noop when cleanup finds nothing visible and nothing tracked', async () => {
    catalog.getEntityByRef.mockResolvedValue(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).resolves.toEqual({ mode: 'noop' });

    expect(permissions.authorize).not.toHaveBeenCalled();
    expect(provider.unregister).not.toHaveBeenCalled();
  });

  it('refuses to delete a visible entity that is not an execution environment', async () => {
    catalog.getEntityByRef.mockResolvedValue({
      kind: 'Component',
      spec: { type: 'service' },
      metadata: { name: 'my-ee' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).rejects.toThrow('Refusing to delete non-execution-environment entity');
    expect(provider.unregister).not.toHaveBeenCalled();
  });

  it('refuses to remove a shared catalog location when the entity has no uid', async () => {
    const entity = {
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: { name: 'my-ee' },
    };
    catalog.getEntityByRef.mockResolvedValue(entity);
    catalog.getLocationByEntity.mockResolvedValue({
      id: 'loc-1',
      type: 'url',
      target: 'https://example.com/catalog-info.yaml',
    });
    catalog.getEntities.mockResolvedValue({ items: [{}, {}] });
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).rejects.toThrow(
      'Refusing to remove shared catalog location with colocated entities',
    );
    expect(catalog.removeEntityByUid).not.toHaveBeenCalled();
    expect(lockContext.clearRegistration).not.toHaveBeenCalled();
  });

  it('removes a colocated entity by uid and reports an entity-transient warning', async () => {
    const entity = {
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: { name: 'my-ee', uid: 'uid-1' },
    };
    catalog.getEntityByRef.mockResolvedValue(entity);
    catalog.getLocationByEntity.mockResolvedValue({
      id: 'loc-1',
      type: 'url',
      target: 'https://example.com/catalog-info.yaml',
    });
    catalog.getEntities.mockResolvedValue({ items: [{}, {}] });
    catalog.removeEntityByUid = jest.fn().mockResolvedValue(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).resolves.toEqual({
      mode: 'entity-transient',
      warning:
        'Shared catalog location still exists; the entity may reappear until catalog-info.yaml is updated.',
    });
    expect(catalog.removeEntityByUid).toHaveBeenCalledWith('uid-1', {
      token: 'catalog-token',
    });
    expect(lockContext.clearRegistration).toHaveBeenCalledTimes(1);
  });

  it('removes the catalog location when the entity is its sole owner', async () => {
    const entity = {
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: { name: 'my-ee', uid: 'uid-1' },
    };
    catalog.getEntityByRef.mockResolvedValue(entity);
    catalog.getLocationByEntity.mockResolvedValue({
      id: 'loc-1',
      type: 'url',
      target: 'https://example.com/catalog-info.yaml',
    });
    catalog.getEntities.mockResolvedValue({ items: [{}] });
    catalog.removeLocationById.mockResolvedValue(undefined);
    auth.getOwnServiceCredentials.mockResolvedValue({
      principal: { type: 'service', subject: 'catalog' },
    });
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      {} as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).resolves.toEqual({ mode: 'location' });

    expect(catalog.removeLocationById).toHaveBeenCalledWith('loc-1', {
      token: 'catalog-token',
    });
    expect(lockContext.clearRegistration).toHaveBeenCalledTimes(1);
  });

  it('swallows a removal error when the entity was already removed by the provider', async () => {
    const entity = {
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: { name: 'my-ee', uid: 'uid-1' },
    };
    catalog.getEntityByRef
      .mockResolvedValueOnce(entity)
      .mockResolvedValueOnce(undefined);
    catalog.getLocationByEntity.mockResolvedValue(undefined);
    catalog.removeEntityByUid = jest
      .fn()
      .mockRejectedValue(new Error('already gone'));
    const logger = { debug: jest.fn() };
    const adapter = new EEEntityLifecycleAdapter(
      providers,
      providerId,
      logger as any,
      auth,
      permissions,
      catalog,
    );

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).resolves.toEqual({ mode: 'provider' });

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'EE entity was already removed by provider delta',
      ),
    );
    expect(lockContext.clearRegistration).toHaveBeenCalledTimes(1);
  });
});

describe('eeEntityLifecycleServiceFactory', () => {
  it('constructs an EEEntityLifecycleAdapter backed by a CatalogClient', async () => {
    // The public ServiceFactory type does not expose `factory`, but the
    // backend wiring relies on calling it directly at runtime.
    const factory = eeEntityLifecycleServiceFactory as unknown as {
      factory: (deps: Record<string, unknown>) => Promise<unknown>;
    };
    const instance = await factory.factory({
      logger: {} as any,
      auth: {} as any,
      permissions: {} as any,
      discovery: { getBaseUrl: jest.fn() } as any,
      config: { getString: () => providerId } as any,
      providers: { get: jest.fn() } as any,
    });

    expect(instance).toBeInstanceOf(EEEntityLifecycleAdapter);
  });
});
