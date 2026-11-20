import { ConfigReader } from '@backstage/config';

import {
  CATALOG_PROVIDERS_AAP,
  CATALOG_PROVIDERS_RHAAP,
  runWithCatalogProvidersConfigRoot,
} from '@ansible/backstage-rhaap-common/catalog';
import {
  findMissingConfiguredOrganizations,
  getAnsibleConfig,
  getCatalogConfig,
} from './config';

describe('findMissingConfiguredOrganizations', () => {
  it('returns empty when all configured orgs exist in AAP', () => {
    expect(
      findMissingConfiguredOrganizations(
        ['Default', 'Engineering'],
        ['Default', 'Engineering'],
      ),
    ).toEqual([]);
  });

  it('is case-insensitive when matching', () => {
    expect(
      findMissingConfiguredOrganizations(['default'], ['Default']),
    ).toEqual([]);
  });

  it('returns configured spelling for missing orgs', () => {
    expect(
      findMissingConfiguredOrganizations(
        ['Default', 'Engineering'],
        ['Default'],
      ),
    ).toEqual(['Engineering']);
  });

  it('returns all configured orgs when AAP returns none', () => {
    expect(findMissingConfiguredOrganizations(['Default', 'Ops'], [])).toEqual([
      'Default',
      'Ops',
    ]);
  });
});

describe('getCatalogConfig', () => {
  it('reads organizations from catalog.providers.aap without a legacy rhaap copy', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          aap: {
            development: {
              multiOrgEnabled: true,
              orgs: ['Engineering', 'Finance'],
            },
          },
        },
      },
    });

    expect(getCatalogConfig(config).organizations).toEqual([
      'engineering',
      'finance',
    ]);
  });

  it('uses the active provider organization list instead of the other root', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          aap: { dev: { orgs: ['Platform'] } },
          rhaap: { dev: { orgs: ['Engineering'] } },
        },
      },
    });

    expect(
      runWithCatalogProvidersConfigRoot(
        CATALOG_PROVIDERS_RHAAP,
        () => getCatalogConfig(config).organizations,
      ),
    ).toEqual(['engineering']);
    expect(
      runWithCatalogProvidersConfigRoot(
        CATALOG_PROVIDERS_AAP,
        () => getCatalogConfig(config).organizations,
      ),
    ).toEqual(['platform']);
  });
});

describe('getAnsibleConfig', () => {
  it('starts when the ansible block is omitted', () => {
    expect(getAnsibleConfig(new ConfigReader({})).rhaap?.checkSSL).toBe(true);
  });
});
