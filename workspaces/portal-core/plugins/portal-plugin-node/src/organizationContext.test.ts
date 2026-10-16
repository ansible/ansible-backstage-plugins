import { mockServices } from '@backstage/backend-test-utils';
import { resolvePortalContext } from './organizationContext';

describe('trusted Portal organization context', () => {
  const credentials = {
    $$type: '@backstage/BackstageCredentials' as const,
    principal: { type: 'user', userEntityRef: 'user:default/alice' },
  };
  const userInfo = mockServices.userInfo.mock();
  const organizations = { resolve: jest.fn() };
  beforeEach(() => {
    jest.resetAllMocks();
    userInfo.getUserInfo.mockResolvedValue({
      userEntityRef: 'user:default/alice',
      ownershipEntityRefs: [],
    });
    organizations.resolve.mockResolvedValue('engineering');
  });
  it('does not confuse identity namespace with deployment organization', async () => {
    await expect(
      resolvePortalContext({ credentials, userInfo, organizations }),
    ).resolves.toEqual({
      userId: 'alice',
      userEntityRef: 'user:default/alice',
      organizationId: 'engineering',
    });
    expect(organizations.resolve).toHaveBeenCalledWith(credentials);
  });
  it.each([undefined, '', '  '])(
    'rejects unresolved organization %j',
    async value => {
      organizations.resolve.mockResolvedValue(value);
      await expect(
        resolvePortalContext({ credentials, userInfo, organizations }),
      ).rejects.toThrow(/organization/i);
    },
  );
  it('denies resolver failure', async () => {
    organizations.resolve.mockRejectedValue(new Error('Unavailable'));
    await expect(
      resolvePortalContext({ credentials, userInfo, organizations }),
    ).rejects.toThrow('could not be resolved');
  });
  it('rejects service callers and invalid identities', async () => {
    await expect(
      resolvePortalContext({
        credentials: await mockServices.auth().getOwnServiceCredentials(),
        userInfo,
        organizations,
      }),
    ).rejects.toThrow('authenticated user');
    expect(organizations.resolve).not.toHaveBeenCalled();
    userInfo.getUserInfo.mockResolvedValue({
      userEntityRef: 'not-a-user-ref',
      ownershipEntityRefs: [],
    });
    await expect(
      resolvePortalContext({ credentials, userInfo, organizations }),
    ).rejects.toThrow('identity');
  });
});

describe('multi-organization Portal context', () => {
  it('preserves memberships without inventing an active organization', async () => {
    const credentials = {
      $$type: '@backstage/BackstageCredentials' as const,
      principal: { type: 'user', userEntityRef: 'user:default/aap-user-42' },
    };
    const userInfo = mockServices.userInfo.mock();
    userInfo.getUserInfo.mockResolvedValue({
      userEntityRef: 'user:default/aap-user-42',
      ownershipEntityRefs: [],
    });
    const organizations = {
      resolve: jest.fn(),
      resolveAll: jest
        .fn()
        .mockResolvedValue(['finance', 'engineering', 'finance']),
    };
    await expect(
      resolvePortalContext({ credentials, userInfo, organizations }),
    ).resolves.toEqual({
      userId: 'aap-user-42',
      userEntityRef: 'user:default/aap-user-42',
      organizationIds: ['engineering', 'finance'],
    });
    expect(organizations.resolve).not.toHaveBeenCalled();
  });
});
