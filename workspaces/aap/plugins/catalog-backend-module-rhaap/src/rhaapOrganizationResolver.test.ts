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

  it('rejects differing organization lists when both roots publish identity', () => {
    const identitySync = {
      sync: {
        orgsUsersTeams: {
          schedule: { frequency: { minutes: 30 }, timeout: { minutes: 3 } },
        },
      },
    };
    expect(
      () =>
        new RhaapOrganizationResolver(
          new ConfigReader({
            catalog: {
              providers: {
                aap: {
                  dev: {
                    orgs: ['Platform'],
                    multiOrgEnabled: true,
                    ...identitySync,
                  },
                },
                rhaap: {
                  dev: {
                    orgs: ['Engineering', 'Finance'],
                    multiOrgEnabled: true,
                    ...identitySync,
                  },
                },
              },
            },
          }),
          client,
        ),
    ).toThrow('organizations (platform)');
  });

  it('uses the aap organization list when both roots publish the same identity', async () => {
    const identitySync = {
      sync: {
        orgsUsersTeams: {
          schedule: { frequency: { minutes: 30 }, timeout: { minutes: 3 } },
        },
      },
    };
    const both = new RhaapOrganizationResolver(
      new ConfigReader({
        catalog: {
          providers: {
            aap: {
              dev: {
                orgs: ['Engineering', 'Finance'],
                multiOrgEnabled: true,
                ...identitySync,
              },
            },
            rhaap: {
              dev: {
                orgs: ['Engineering', 'Finance'],
                multiOrgEnabled: true,
                ...identitySync,
              },
            },
          },
        },
      }),
      client,
    );
    await expect(both.resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
    expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, [
      'engineering',
      'finance',
    ]);
  });

  it('follows aap membership when legacy rhaap is content-only', async () => {
    const split = new RhaapOrganizationResolver(
      new ConfigReader({
        catalog: {
          providers: {
            aap: {
              dev: { orgs: ['Engineering', 'Finance'], multiOrgEnabled: true },
            },
            rhaap: {
              production: {
                sync: { ansibleGitContents: { enabled: true } },
              },
            },
          },
        },
      }),
      client,
    );
    await expect(split.resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
  });

  it('rejects identity modes that differ across environment keys', () => {
    expect(
      () =>
        new RhaapOrganizationResolver(
          new ConfigReader({
            catalog: {
              providers: {
                aap: {
                  dev: {
                    orgs: ['Platform'],
                    multiOrgEnabled: false,
                    sync: {
                      orgsUsersTeams: {
                        schedule: {
                          frequency: { minutes: 30 },
                          timeout: { minutes: 3 },
                        },
                      },
                    },
                  },
                },
                rhaap: {
                  prod: {
                    orgs: ['Engineering'],
                    multiOrgEnabled: true,
                    sync: {
                      orgsUsersTeams: {
                        schedule: {
                          frequency: { minutes: 30 },
                          timeout: { minutes: 3 },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
          client,
        ),
    ).toThrow('must use the same identity mode');
  });

  it('rejects dual roots that disagree on multiOrgEnabled', () => {
    const identitySync = {
      sync: {
        orgsUsersTeams: {
          schedule: { frequency: { minutes: 30 }, timeout: { minutes: 3 } },
        },
      },
    };
    expect(
      () =>
        new RhaapOrganizationResolver(
          new ConfigReader({
            catalog: {
              providers: {
                aap: {
                  dev: {
                    orgs: ['Platform'],
                    multiOrgEnabled: true,
                    ...identitySync,
                  },
                },
                rhaap: {
                  dev: {
                    orgs: ['Platform'],
                    multiOrgEnabled: false,
                    ...identitySync,
                  },
                },
              },
            },
          }),
          client,
        ),
    ).toThrow('sign-in identity mode');
  });

  it('follows legacy identity orgs when AAP only configures job templates', async () => {
    const split = new RhaapOrganizationResolver(
      new ConfigReader({
        catalog: {
          providers: {
            aap: {
              jobs: {
                orgs: ['Platform'],
                multiOrgEnabled: true,
                sync: {
                  jobTemplates: {
                    enabled: true,
                    schedule: {
                      frequency: { minutes: 30 },
                      timeout: { minutes: 3 },
                    },
                  },
                },
              },
            },
            rhaap: {
              production: {
                orgs: ['Engineering'],
                multiOrgEnabled: true,
                sync: {
                  orgsUsersTeams: {
                    schedule: {
                      frequency: { minutes: 30 },
                      timeout: { minutes: 3 },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      client,
    );
    await expect(split.resolveAll(credentials())).resolves.toEqual([
      'engineering',
    ]);
    expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, ['engineering']);
  });

  it('does not add Default from a job-template-only environment', async () => {
    const identitySync = {
      sync: {
        orgsUsersTeams: {
          schedule: { frequency: { minutes: 30 }, timeout: { minutes: 3 } },
        },
      },
    };
    client.getOrgsByUserId.mockResolvedValue([
      { name: 'Finance' },
      { name: 'Default' },
    ]);
    client.getTeamsByUserId.mockResolvedValue([]);
    const resolverWithJobs = new RhaapOrganizationResolver(
      new ConfigReader({
        catalog: {
          providers: {
            aap: {
              identity: {
                orgs: ['Finance'],
                multiOrgEnabled: true,
                ...identitySync,
              },
              jobs: {
                sync: {
                  jobTemplates: {
                    enabled: true,
                    schedule: {
                      frequency: { minutes: 30 },
                      timeout: { minutes: 3 },
                    },
                  },
                },
              },
            },
            rhaap: {
              identity: {
                orgs: ['Finance'],
                multiOrgEnabled: true,
                ...identitySync,
              },
            },
          },
        },
      }),
      client,
    );
    await expect(resolverWithJobs.resolveAll(credentials())).resolves.toEqual([
      'finance',
    ]);
    expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, ['finance']);
  });

  it.each(['aap', 'rhaap'] as const)(
    'ignores no-sync environments on %s when identity publishers exist',
    async root => {
      client.getUserInfoById.mockResolvedValue({
        id: 42,
        username: 'Alice',
        is_superuser: false,
      });
      client.getOrgsByUserId.mockResolvedValue([{ name: 'Finance' }]);
      client.getTeamsByUserId.mockResolvedValue([]);
      const split = new RhaapOrganizationResolver(
        new ConfigReader({
          catalog: {
            providers: {
              [root]: {
                identity: {
                  orgs: ['Finance'],
                  multiOrgEnabled: false,
                  sync: {
                    orgsUsersTeams: {
                      schedule: {
                        frequency: { minutes: 30 },
                        timeout: { minutes: 3 },
                      },
                    },
                  },
                },
                extra: {
                  orgs: ['Engineering'],
                  multiOrgEnabled: true,
                },
              },
            },
          },
        }),
        client,
      );
      await expect(
        split.resolveAll(credentials('user:default/Alice')),
      ).resolves.toEqual(['finance']);
      expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, ['finance']);
    },
  );

  it('keeps organization membership when the selected root has no identity publisher', async () => {
    const legacy = new RhaapOrganizationResolver(
      new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              production: {
                orgs: ['Engineering', 'Finance'],
                multiOrgEnabled: true,
                sync: {
                  jobTemplates: {
                    enabled: true,
                    schedule: {
                      frequency: { minutes: 30 },
                      timeout: { minutes: 3 },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      client,
    );
    await expect(legacy.resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
    expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, [
      'engineering',
      'finance',
    ]);
  });

  it('does not treat job-template organization settings as identity publishers', () => {
    expect(
      () =>
        new RhaapOrganizationResolver(
          new ConfigReader({
            catalog: {
              providers: {
                aap: {
                  dev: {
                    orgs: ['Platform'],
                    multiOrgEnabled: true,
                    sync: {
                      orgsUsersTeams: {
                        schedule: {
                          frequency: { minutes: 30 },
                          timeout: { minutes: 3 },
                        },
                      },
                    },
                  },
                },
                rhaap: {
                  dev: {
                    orgs: ['Engineering'],
                    multiOrgEnabled: false,
                    sync: {
                      jobTemplates: {
                        enabled: true,
                        schedule: {
                          frequency: { minutes: 30 },
                          timeout: { minutes: 3 },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
          client,
        ),
    ).not.toThrow();
  });

  it('uses the default organization when orgs is omitted', async () => {
    client.getUserInfoById.mockResolvedValue({
      id: 42,
      username: 'Alice',
      is_superuser: false,
    });
    client.getOrgsByUserId.mockResolvedValue([{ name: 'Default' }]);
    client.getTeamsByUserId.mockResolvedValue([]);
    await expect(
      resolver({ dev: {} }).resolveAll(credentials('user:default/Alice')),
    ).resolves.toEqual(['default']);
    expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, ['default']);
  });

  it('resolves memberships from catalog.providers.aap without a legacy rhaap copy', async () => {
    const split = new RhaapOrganizationResolver(
      new ConfigReader({
        catalog: {
          providers: {
            aap: {
              dev: { orgs: ['Engineering', 'Finance'], multiOrgEnabled: true },
            },
          },
        },
      }),
      client,
    );
    await expect(split.resolveAll(credentials())).resolves.toEqual([
      'engineering',
      'finance',
    ]);
    expect(client.executeGetRequest).not.toHaveBeenCalled();
    expect(client.getOrgsByUserId).toHaveBeenCalledWith(42, [
      'engineering',
      'finance',
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
