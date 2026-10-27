import { ConfigReader } from '@backstage/config';

import {
  CATALOG_PROVIDERS_AAP,
  CATALOG_PROVIDERS_INTERIM_CONTENT,
  CATALOG_PROVIDERS_RHAAP,
  catalogProvidersConfigRootForSlice,
  getResolvedCatalogProvidersConfig,
  runWithCatalogProvidersConfigRoot,
} from './catalogProviderConfig';
import { readAapApiEntityConfigs } from './providers/config';

describe('catalogProviderConfig', () => {
  it('maps slices to provider config roots', () => {
    expect(catalogProvidersConfigRootForSlice('all')).toBe(
      CATALOG_PROVIDERS_RHAAP,
    );
    expect(catalogProvidersConfigRootForSlice('aap')).toBe(
      CATALOG_PROVIDERS_AAP,
    );
    expect(catalogProvidersConfigRootForSlice('content')).toBe(
      CATALOG_PROVIDERS_INTERIM_CONTENT,
    );
  });

  it('reads split aap config with legacy rhaap fallback', () => {
    const config = new ConfigReader({
      ansible: {
        rhaap: {
          baseUrl: 'https://aap.example.com',
          token: 't',
          checkSSL: true,
        },
      },
      catalog: {
        providers: {
          rhaap: {
            production: { orgs: 'LegacyOrg' },
          },
        },
      },
    });

    runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_AAP, () => {
      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(['legacyorg']);
    });
  });

  it('prefers primary key over legacy when both are set', () => {
    const config = new ConfigReader({
      ansible: {
        rhaap: {
          baseUrl: 'https://aap.example.com',
          token: 't',
          checkSSL: true,
        },
      },
      catalog: {
        providers: {
          aap: {
            production: { orgs: 'SplitOrg' },
          },
          rhaap: {
            production: { orgs: 'LegacyOrg' },
          },
        },
      },
    });

    runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_AAP, () => {
      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs[0].organizations).toEqual(['splitorg']);
    });
  });

  it('resolves interim-content root with rhaap fallback', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          rhaap: {
            production: { orgs: 'x' },
          },
        },
      },
    });

    runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_INTERIM_CONTENT, () => {
      expect(getResolvedCatalogProvidersConfig(config)?.keys()).toEqual([
        'production',
      ]);
    });
  });
});
