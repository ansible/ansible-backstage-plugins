import { mockServices } from '@backstage/backend-test-utils';

import { contentCatalogRegistration } from './contentCatalogRegistration';

jest.mock('./providers/PAHCollectionProvider', () => ({
  PAHCollectionProvider: {
    fromConfig: jest.fn(() => [{ getProviderName: () => 'PAH:test' }]),
  },
}));

jest.mock('./providers/AnsibleGitContentsProvider', () => ({
  AnsibleGitContentsProvider: {
    fromConfig: jest.fn(async () => [
      { getProviderName: () => 'GitContents:test' },
    ]),
  },
}));

describe('contentCatalogRegistration', () => {
  it('creates PAH and git content providers', async () => {
    const logger = mockServices.logger.mock();
    const providers = await contentCatalogRegistration.createProviders({
      config: mockServices.rootConfig(),
      logger,
      scheduler: mockServices.scheduler.mock(),
      ansibleService: {} as any,
    });

    expect(providers.eeEntityProvider).toBeUndefined();
    expect(providers.pahCollectionProviders).toHaveLength(1);
    expect(providers.ansibleGitContentsProviders).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Created 1 Ansible Git Contents provider'),
    );
  });
});
