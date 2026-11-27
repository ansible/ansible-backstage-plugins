/**
 * @jest-environment node
 */
import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import {
  CATALOG_PROVIDERS_CONTENT,
  runWithCatalogProvidersConfigRoot,
} from '@ansible/backstage-rhaap-common/catalog';

import { contentCatalogRegistration } from './contentCatalogRegistration';

jest.mock('./providers/ansible-collections/scm', () => ({
  ScmCrawlerFactory: jest.fn().mockImplementation(() => ({
    createCrawler: jest.fn().mockResolvedValue({
      getRepositories: jest.fn().mockResolvedValue([]),
      getBranches: jest.fn().mockResolvedValue(['main']),
      getTags: jest.fn().mockResolvedValue([]),
      getContents: jest.fn().mockResolvedValue([]),
      getFileContent: jest.fn().mockResolvedValue(''),
      buildSourceLocation: jest.fn().mockReturnValue('url:https://example.com'),
      discoverGalaxyFiles: jest.fn().mockResolvedValue([]),
      discoverGalaxyFilesInRepos: jest.fn().mockResolvedValue([]),
    }),
  })),
}));

const identitySchedule = {
  frequency: { minutes: 30 },
  timeout: { minutes: 3 },
};

function gitOnlyConfig(aapMultiOrgEnabled: boolean) {
  return new ConfigReader({
    catalog: {
      providers: {
        aap: {
          identity: {
            multiOrgEnabled: aapMultiOrgEnabled,
            orgs: ['Platform'],
            sync: { orgsUsersTeams: { schedule: identitySchedule } },
          },
        },
        rhaap: {
          identity: {
            multiOrgEnabled: false,
            orgs: ['Default'],
            sync: { orgsUsersTeams: { schedule: identitySchedule } },
          },
        },
        content: {
          production: {
            sync: {
              ansibleGitContents: {
                schedule: identitySchedule,
                providers: {
                  github: [{ name: 'internal', orgs: [{ name: 'acme' }] }],
                },
              },
            },
          },
        },
      },
    },
  });
}

describe('contentCatalogRegistration git-only startup', () => {
  it('creates git providers when unused AAP identity modes disagree and PAH is absent', async () => {
    const logger = mockServices.logger.mock();
    const scheduler = {
      createScheduledTaskRunner: jest.fn().mockReturnValue({
        run: jest.fn(),
      }),
    } as any;

    const providers = await runWithCatalogProvidersConfigRoot(
      CATALOG_PROVIDERS_CONTENT,
      () =>
        contentCatalogRegistration.createProviders({
          config: gitOnlyConfig(true),
          logger,
          scheduler,
          ansibleService: {} as any,
        }),
    );

    expect(logger.error).not.toHaveBeenCalled();
    expect(providers.pahCollectionProviders).toEqual([]);
    expect(providers.ansibleGitContentsProviders).toHaveLength(1);
  });
});
