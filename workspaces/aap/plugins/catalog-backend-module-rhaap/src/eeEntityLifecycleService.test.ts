import { EELifecycleService } from './eeEntityLifecycleService';
import { AuthorizeResult } from '@backstage/plugin-permission-common';

describe('EELifecycleService', () => {
  const logger = { info: jest.fn(), debug: jest.fn() } as any;
  const auth = {
    getPluginRequestToken: jest.fn().mockResolvedValue({ token: 'catalog-token' }),
    getOwnServiceCredentials: jest.fn().mockResolvedValue({}),
  } as any;
  const permissions = {
    authorize: jest.fn().mockResolvedValue([{ result: AuthorizeResult.ALLOW }]),
  } as any;
  const catalogClient = {
    getEntityByRef: jest.fn(),
    getLocationByEntity: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('returns noop when there is no existing entity to clean up', async () => {
    catalogClient.getEntityByRef.mockResolvedValue(undefined);
    const service = new EELifecycleService(logger, auth, permissions, catalogClient);

    await expect(
      service.unregisterExecutionEnvironment('  my-ee  ', {} as any),
    ).resolves.toEqual({ mode: 'noop' });
    expect(permissions.authorize).not.toHaveBeenCalled();
  });

  it('enforces catalog create permission before registration', async () => {
    permissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);
    const service = new EELifecycleService(logger, auth, permissions, catalogClient);

    await expect(
      service.registerExecutionEnvironment(
        { kind: 'Component', metadata: { name: 'my-ee' } },
        {} as any,
      ),
    ).rejects.toThrow('insufficient permissions to create');
  });
});
