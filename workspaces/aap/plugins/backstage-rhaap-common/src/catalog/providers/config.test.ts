/**
 * @jest-environment node
 */
import { ConfigReader } from '@backstage/config';
import {
  CATALOG_PROVIDERS_AAP,
  CATALOG_PROVIDERS_CONTENT,
  runWithCatalogProvidersConfigRoot,
} from '../catalogProviderConfig';
import { readAapApiEntityConfigs } from './config';

const orgSync = {
  sync: {
    orgsUsersTeams: {
      schedule: {
        frequency: { minutes: 30 },
        timeout: { minutes: 3 },
      },
    },
  },
};

const baseConfig = {
  ansible: {
    rhaap: {
      baseUrl: 'https://aap.example.com',
      token: 'test-token',
      checkSSL: false,
    },
  },
};

describe('readAapApiEntityConfigs', () => {
  describe('sane defaults', () => {
    it.each([
      { scenario: 'orgs is omitted', orgs: undefined, expected: ['default'] },
      { scenario: 'orgs is empty string', orgs: '', expected: ['default'] },
      {
        scenario: 'orgs is configured',
        orgs: 'Engineering',
        expected: ['engineering'],
      },
    ])('should resolve to $expected when $scenario', ({ orgs, expected }) => {
      const envConfig: { orgs?: string; sync: typeof orgSync.sync } = {
        ...orgSync,
      };
      if (orgs !== undefined) envConfig.orgs = orgs;

      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: envConfig,
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(expected);
    });

    it('should use only first org from comma-separated when multiOrgEnabled is false', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                orgs: 'Default, Engineering',
                ...orgSync,
              },
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(['default']);
    });

    it('should use only first org from array when multiOrgEnabled is false', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                orgs: ['Default', 'Engineering'],
                ...orgSync,
              },
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(['default']);
    });
  });

  describe('multiOrgEnabled', () => {
    it('should default to false when omitted', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                orgs: ['Default', 'Engineering'],
                ...orgSync,
              },
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs[0].multiOrgEnabled).toBe(false);
      expect(configs[0].organizations).toEqual(['default']);
    });

    it('should sync only first org when multiOrgEnabled is false', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                multiOrgEnabled: false,
                orgs: ['Default', 'Engineering', 'SecOps'],
                ...orgSync,
              },
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs[0].multiOrgEnabled).toBe(false);
      expect(configs[0].organizations).toEqual(['default']);
    });

    it('should sync all orgs when multiOrgEnabled is true', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                multiOrgEnabled: true,
                orgs: ['Default', 'Engineering', 'SecOps'],
                ...orgSync,
              },
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs[0].multiOrgEnabled).toBe(true);
      expect(configs[0].organizations).toEqual([
        'default',
        'engineering',
        'secops',
      ]);
    });

    it('does not derive flag-on namespaces from org slugs', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                multiOrgEnabled: true,
                orgs: ['my-org', 'my_org'],
                ...orgSync,
              },
            },
          },
        },
      });

      expect(() =>
        readAapApiEntityConfigs(config, 'orgsUsersTeams'),
      ).not.toThrow();
    });

    it('should not validate collisions when multiOrgEnabled is false', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                multiOrgEnabled: false,
                orgs: ['my-org', 'my_org'],
                ...orgSync,
              },
            },
          },
        },
      });

      expect(() =>
        readAapApiEntityConfigs(config, 'orgsUsersTeams'),
      ).not.toThrow();
      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs[0].organizations).toEqual(['my-org']);
    });
  });

  describe('missing sync configuration', () => {
    it('skips identity sync when the environment has no sync block', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            aap: { dev: { orgs: ['Platform'] } },
            rhaap: {
              dev: {
                orgs: ['Engineering'],
                ...orgSync,
              },
            },
          },
        },
      });

      const configs = runWithCatalogProvidersConfigRoot(
        CATALOG_PROVIDERS_AAP,
        () => readAapApiEntityConfigs(config, 'orgsUsersTeams'),
      );
      expect(configs).toEqual([]);
      expect(configs.map(item => item.organizations)).not.toEqual([
        ['engineering'],
      ]);
      expect(
        runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_AAP, () =>
          readAapApiEntityConfigs(config, 'jobTemplates'),
        ),
      ).toEqual([]);
    });

    it('names the missing schedule when a sync block is enabled without one', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            aap: {
              dev: {
                sync: { jobTemplates: { enabled: true } },
              },
            },
          },
        },
      });

      expect(() =>
        runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_AAP, () =>
          readAapApiEntityConfigs(config, 'jobTemplates'),
        ),
      ).toThrow('sync.jobTemplates.schedule');
    });

    it('skips PAH reads when an environment has no PAH repositories', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            content: {
              dev: {
                sync: { ansibleGitContents: { enabled: true } },
              },
            },
          },
        },
      });

      expect(
        runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_CONTENT, () =>
          readAapApiEntityConfigs(config, 'pahCollections'),
        ),
      ).toEqual([]);
    });

    it('reads the content PAH repository instead of the legacy repository', () => {
      const schedule = {
        frequency: { minutes: 30 },
        timeout: { minutes: 3 },
      };
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            content: {
              dev: {
                sync: {
                  pahCollections: {
                    enabled: true,
                    repositories: [{ name: 'platform-pah', schedule }],
                  },
                },
              },
            },
            rhaap: {
              dev: {
                sync: {
                  pahCollections: {
                    enabled: true,
                    repositories: [{ name: 'legacy-pah', schedule }],
                  },
                },
              },
            },
          },
        },
      });

      const configs = runWithCatalogProvidersConfigRoot(
        CATALOG_PROVIDERS_CONTENT,
        () => readAapApiEntityConfigs(config, 'pahCollections'),
      );
      const repositories = configs[0]?.pahRepositories ?? [];
      expect(repositories.map(repository => repository.name)).toEqual([
        'platform-pah',
      ]);
    });

    it('defaults checkSSL to true when the setting is omitted', () => {
      const { checkSSL: _ignored, ...rhaap } = baseConfig.ansible.rhaap;
      const config = new ConfigReader({
        ansible: { rhaap },
        catalog: {
          providers: {
            rhaap: { production: { ...orgSync } },
          },
        },
      });

      expect(
        readAapApiEntityConfigs(config, 'orgsUsersTeams')[0].checkSSL,
      ).toBe(true);
    });
  });
});
