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
    it('should default to ["default"] when orgs is omitted', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {},
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(['default']);
    });

    it('should default to ["default"] when orgs is empty string', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                orgs: '',
              },
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(['default']);
    });

    it('should use configured orgs when provided', () => {
      const config = new ConfigReader({
        ...baseConfig,
        catalog: {
          providers: {
            rhaap: {
              production: {
                orgs: 'Engineering',
              },
            },
          },
        },
      });

      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(['engineering']);
    });

    it('should parse comma-separated orgs', () => {
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
      expect(configs[0].organizations).toEqual(['default', 'engineering']);
    });

    it('should parse array orgs', () => {
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
      expect(configs[0].organizations).toEqual(['default', 'engineering']);
    });
  });
});
