import { ConfigReader } from '@backstage/config';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { JsonObject } from '@backstage/types';
import {
  mockServices,
  ServiceFactoryTester,
} from '@backstage/backend-test-utils';
import {
  RhaapOrganizationResolver,
  rhaapOrganizationServiceFactory,
} from './rhaapOrganizationResolver';

describe('Trusted AAP organization resolution', () => {
  const client = {
    executeGetRequest: jest.fn(),
    getUserInfoById: jest.fn(),
    getOrgsByUserId: jest.fn(),
    getTeamsByUserId: jest.fn(),
  };
  const credentials = (
    ref = 'user:default/aap-user-42',
  ): BackstageCredentials => ({
    $$type: '@backstage/BackstageCredentials',
    principal: { type: 'user', userEntityRef: ref },
  });
  const config = (
    providers: JsonObject = {
      dev: { orgs: ['Engineering', 'Finance'], multiOrgEnabled: true },
    },
  ) => new ConfigReader({ catalog: { providers: { rhaap: providers } } });
  const resolver = (providers?: JsonObject) =>
    new RhaapOrganizationResolver(config(providers), client);
  beforeEach(() => {
    jest.resetAllMocks();
    client.executeGetRequest.mockResolvedValue({
      json: async () => ({ count: 1, results: [{ id: 42 }] }),
    });
    client.getUserInfoById.mockResolvedValue({
      id: 42,
      username: 'Alice',
      is_superuser: false,
    });
    client.getOrgsByUserId.mockResolvedValue([
      { name: ' Engineering ' },
      { name: 'Unconfigured' },
    ]);
    client.getTeamsByUserId.mockResolvedValue([
      { orgName: 'FINANCE' },
      { orgName: 'engineering' },
    ]);
  });

  it('normalizes and deduplicates direct and team memberships without trusting the catalog namespace', async () => {
    await expect(resolver().resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
    await expect(resolver().resolve(credentials())).resolves.toBeUndefined();
    expect(client.getUserInfoById).toHaveBeenCalledWith(42);
    expect(client.executeGetRequest).not.toHaveBeenCalled();
    expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, [
      'engineering',
      'finance',
    ]);
  });

  it('resolves exactly one matching organization when other memberships are not configured', async () => {
    client.getTeamsByUserId.mockResolvedValue([]);
    await expect(resolver().resolve(credentials())).resolves.toBe(
      'engineering',
    );
  });

  it('returns all configured organizations for a verified AAP superuser without a membership request', async () => {
    client.getUserInfoById.mockResolvedValue({
      id: 42,
      username: 'Alice',
      is_superuser: true,
    });
    await expect(resolver().resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
    expect(client.getOrgsByUserId).not.toHaveBeenCalled();
  });

  it('accepts comma-separated organizations and merges multiple provider configurations', async () => {
    await expect(
      resolver({
        one: { orgs: ' Engineering, Finance ', multiOrgEnabled: true },
        two: { orgs: ['Engineering'], multiOrgEnabled: true },
      }).resolveAll(credentials()),
    ).resolves.toEqual(['engineering', 'finance']);
  });

  it('supports unambiguous legacy username lookup with a server token and single-org configuration', async () => {
    const legacy = new RhaapOrganizationResolver(
      new ConfigReader({
        ansible: { rhaap: { token: 'server-token' } },
        catalog: {
          providers: { rhaap: { dev: { orgs: ['Engineering', 'Finance'] } } },
        },
      }),
      client,
    );
    await expect(
      legacy.resolve(credentials('user:default/alice')),
    ).resolves.toBe('engineering');
    expect(client.executeGetRequest).toHaveBeenCalledWith(
      'api/gateway/v1/users/?username__iexact=alice&page_size=2',
      'server-token',
    );
  });

  it('allows an omitted count only for a single non-paginated result and uses a null token when none is configured', async () => {
    client.executeGetRequest.mockResolvedValue({
      json: async () => ({ results: [{ id: 42 }] }),
    });
    await expect(
      resolver({ dev: { orgs: ['Engineering'] } }).resolve(
        credentials('user:default/alice'),
      ),
    ).resolves.toBe('engineering');
    expect(client.executeGetRequest).toHaveBeenCalledWith(
      expect.any(String),
      null,
    );
  });

  it.each([
    null,
    {},
    'user',
    { type: 'service' },
    { type: 'user' },
    { type: 'user', userEntityRef: 42 },
  ])('fails closed for malformed or non-user principal %j', async principal => {
    await expect(
      resolver().resolveAll({
        $$type: '@backstage/BackstageCredentials',
        principal,
      } as unknown as BackstageCredentials),
    ).resolves.toEqual([]);
    expect(client.getUserInfoById).not.toHaveBeenCalled();
  });

  it.each([
    'user:engineering/aap-user-42',
    'group:default/team',
    'user:default/alice',
    'user:default/aap-user-0',
    'user:default/aap-user-9007199254740993',
  ])('rejects an untrusted or unsafe reference %s', async ref => {
    await expect(resolver().resolveAll(credentials(ref))).resolves.toEqual([]);
    expect(client.getUserInfoById).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { dev: {} },
    { dev: { orgs: [] } },
    { dev: { orgs: '' } },
    { dev: { orgs: ['Engineering', ' '] } },
    { dev: { orgs: ['Engineering', 17] } },
  ])(
    'fails closed for incomplete provider configuration %j',
    async providers => {
      await expect(
        resolver(providers).resolveAll(credentials()),
      ).resolves.toEqual([]);
      expect(client.getUserInfoById).not.toHaveBeenCalled();
    },
  );

  it.each([
    { results: [] },
    { results: null },
    { results: [{ id: 42 }, { id: 43 }] },
    { results: [{ id: 42 }], next: '/next' },
    { results: [{ id: 42 }], count: 2 },
    { results: [{ id: -1 }] },
    { results: [{ id: '42' }] },
  ])('denies an ambiguous or invalid legacy lookup %j', async page => {
    client.executeGetRequest.mockResolvedValue({ json: async () => page });
    await expect(
      resolver({ dev: { orgs: ['Engineering'] } }).resolveAll(
        credentials('user:default/alice'),
      ),
    ).resolves.toEqual([]);
    expect(client.getUserInfoById).not.toHaveBeenCalled();
  });

  it.each([
    { id: 43, username: 'Alice' },
    { id: 42, username: 'Mallory' },
  ])(
    'rejects an AAP identity that does not match the authenticated legacy user %j',
    async user => {
      client.getUserInfoById.mockResolvedValue(user);
      await expect(
        resolver({ dev: { orgs: ['Engineering'] } }).resolveAll(
          credentials('user:default/alice'),
        ),
      ).resolves.toEqual([]);
      expect(client.getOrgsByUserId).not.toHaveBeenCalled();
    },
  );

  it.each([
    'executeGetRequest',
    'getUserInfoById',
    'getOrgsByUserId',
    'getTeamsByUserId',
  ] as const)('fails closed when %s rejects', async method => {
    client[method].mockRejectedValue(new Error('Unavailable'));
    await expect(
      resolver({ dev: { orgs: ['Engineering'] } }).resolveAll(
        credentials('user:default/alice'),
      ),
    ).resolves.toEqual([]);
  });

  it('denies absent providers or absent membership adapters', async () => {
    await expect(
      new RhaapOrganizationResolver(new ConfigReader({}), client).resolveAll(
        credentials(),
      ),
    ).resolves.toEqual([]);
    await expect(
      new RhaapOrganizationResolver(config()).resolveAll(credentials()),
    ).resolves.toEqual([]);
  });

  it('constructs the registered service through the backend dependency-injection contract', async () => {
    const subject = await ServiceFactoryTester.from(
      rhaapOrganizationServiceFactory,
      {
        dependencies: [
          mockServices.rootConfig.factory({}),
          mockServices.rootLogger.factory(),
        ],
      },
    ).getSubject();
    expect(subject).toBeInstanceOf(RhaapOrganizationResolver);
    await expect(subject.resolveAll!(credentials())).resolves.toEqual([]);
  });
});
