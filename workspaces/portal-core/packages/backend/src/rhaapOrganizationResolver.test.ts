import { ConfigReader } from '@backstage/config';
import { RhaapOrganizationResolver } from './rhaapOrganizationResolver';

describe('AAP membership organization adapter', () => {
  const client = {
    executeGetRequest: jest.fn(),
    getUserInfoById: jest.fn(),
    getOrgsByUserId: jest.fn(),
    getTeamsByUserId: jest.fn(),
  };
  const credentials = (name = 'aap-user-42') => ({
    $$type: '@backstage/BackstageCredentials' as const,
    principal: { type: 'user', userEntityRef: `user:default/${name}` },
  });
  const resolver = (multiOrgEnabled = true) =>
    new RhaapOrganizationResolver(
      new ConfigReader({
        ansible: { rhaap: { token: 'server-token' } },
        catalog: {
          providers: {
            rhaap: {
              dev: { orgs: ['Engineering', 'Finance'], multiOrgEnabled },
            },
          },
        },
      }),
      client,
    );
  beforeEach(() => {
    jest.resetAllMocks();
    client.executeGetRequest.mockResolvedValue({
      json: async () => ({ count: 1, results: [{ id: 42 }] }),
    });
    client.getUserInfoById.mockResolvedValue({
      id: 42,
      username: 'alice',
      is_superuser: false,
    });
    client.getOrgsByUserId.mockResolvedValue([
      { id: 1, name: 'Engineering', groupName: 'engineering' },
    ]);
    client.getTeamsByUserId.mockResolvedValue([]);
  });
  it('uses authenticated stable user id, not the default namespace as organization', async () => {
    await expect(resolver().resolveAll(credentials())).resolves.toEqual([
      'engineering',
    ]);
    expect(client.getUserInfoById).toHaveBeenCalledWith(42);
    expect(client.executeGetRequest).not.toHaveBeenCalled();
  });
  it('resolves legacy usernames through an unambiguous AAP lookup with the flag off', async () => {
    await expect(
      resolver(false).resolveAll(credentials('alice')),
    ).resolves.toEqual(['engineering']);
    expect(client.executeGetRequest).toHaveBeenCalledWith(
      'api/gateway/v1/users/?username__iexact=alice&page_size=2',
      'server-token',
    );
  });
  it('includes configured team access without promoting it to direct org membership', async () => {
    client.getTeamsByUserId.mockResolvedValue([
      {
        id: 8,
        orgId: 2,
        orgName: 'Finance',
        name: 'finance-team',
        groupName: 'finance-team',
      },
    ]);
    await expect(resolver().resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
    await expect(resolver().resolve(credentials())).resolves.toBeUndefined();
  });
  it('does not grant configured organizations the user does not belong to', async () => {
    client.getOrgsByUserId.mockResolvedValue([
      { id: 3, name: 'Unconfigured', groupName: 'unconfigured' },
    ]);
    await expect(resolver().resolveAll(credentials())).resolves.toEqual([]);
  });
  it('honors existing AAP superuser access without bypassing entitlement grants', async () => {
    client.getUserInfoById.mockResolvedValue({
      id: 42,
      username: 'alice',
      is_superuser: true,
    });
    await expect(resolver().resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
  });
  it('fails closed on unavailable membership data', async () => {
    client.getOrgsByUserId.mockRejectedValue(new Error('Unavailable'));
    await expect(resolver().resolveAll(credentials())).resolves.toEqual([]);
  });
  it('rejects ambiguous username lookup', async () => {
    client.executeGetRequest.mockResolvedValue({
      json: async () => ({ count: 2, results: [{ id: 42 }, { id: 43 }] }),
    });
    await expect(
      resolver(false).resolveAll(credentials('alice')),
    ).resolves.toEqual([]);
    expect(client.getOrgsByUserId).not.toHaveBeenCalled();
  });
  it('does not accept a raw username when the ID-based flag is enabled', async () => {
    await expect(resolver().resolveAll(credentials('alice'))).resolves.toEqual(
      [],
    );
    expect(client.getUserInfoById).not.toHaveBeenCalled();
  });
  it('denies missing providers, service credentials, and missing membership adapter', async () => {
    await expect(
      new RhaapOrganizationResolver(new ConfigReader({}), client).resolveAll(
        credentials(),
      ),
    ).resolves.toEqual([]);
    await expect(
      resolver().resolveAll({
        $$type: '@backstage/BackstageCredentials',
        principal: { type: 'service', subject: 'plugin:catalog' },
      }),
    ).resolves.toEqual([]);
    await expect(
      new RhaapOrganizationResolver(new ConfigReader({})).resolveAll(
        credentials(),
      ),
    ).resolves.toEqual([]);
  });
});
