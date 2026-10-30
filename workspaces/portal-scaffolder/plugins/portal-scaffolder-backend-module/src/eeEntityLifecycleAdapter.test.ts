import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { EEEntityLifecycleAdapter } from './eeEntityLifecycleAdapter';

describe('EEEntityLifecycleAdapter', () => {
  const credentials = {} as any;
  const auth = {
    getPluginRequestToken: jest.fn().mockResolvedValue({ token: 'catalog-token' }),
    getOwnServiceCredentials: jest.fn(),
  } as any;
  const permissions = {
    authorize: jest.fn().mockResolvedValue([{ result: AuthorizeResult.ALLOW }]),
  } as any;
  const provider = { register: jest.fn(), unregister: jest.fn() } as any;
  const catalog = {
    getEntityByRef: jest.fn(),
    getLocationByEntity: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('registers with caller credentials and no service credential lookup', async () => {
    catalog.getEntityByRef.mockResolvedValue(undefined);
    const adapter = new EEEntityLifecycleAdapter(provider, {} as any, auth, permissions, catalog);

    await adapter.registerExecutionEnvironment(
      { kind: 'Component', metadata: { name: 'my-ee' } },
      credentials,
    );

    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    expect(auth.getOwnServiceCredentials).not.toHaveBeenCalled();
    expect(provider.register).toHaveBeenCalled();
  });

  it('does not suppress a failed entity removal when the entity remains', async () => {
    const entity = {
      kind: 'Component',
      spec: { type: 'execution-environment' },
      metadata: { name: 'my-ee', uid: 'uid' },
    };
    catalog.getEntityByRef.mockResolvedValue(entity);
    catalog.getLocationByEntity.mockResolvedValue(undefined);
    catalog.removeEntityByUid = jest.fn().mockRejectedValue(new Error('catalog failed'));
    const adapter = new EEEntityLifecycleAdapter(provider, {} as any, auth, permissions, catalog);

    await expect(
      adapter.unregisterExecutionEnvironment('my-ee', credentials),
    ).rejects.toThrow('catalog failed');
  });
});
