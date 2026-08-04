import { ConfigReader } from '@backstage/config';
import { readAapApiEntityConfigs } from './config';

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
      const envConfig: { orgs?: string } = {};
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

    it('should throw on namespace collision when multiOrgEnabled is true', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                multiOrgEnabled: true,
                orgs: ['my-org', 'my_org'],
              },
            },
          },
        },
      });

      expect(() => readAapApiEntityConfigs(config, 'orgsUsersTeams')).toThrow(
        /both produce namespace/,
      );
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
});
