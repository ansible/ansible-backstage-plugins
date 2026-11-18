import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import { userProvisionerRef } from '@ansible/backstage-rhaap-common';
import catalogFeatureLoader, { catalogModuleRhaap } from './index';
import { rhaapOrganizationServiceFactory } from './rhaapOrganizationResolver';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('catalog backend feature loader', () => {
  it('yields the AAP services and catalog module', async () => {
    const loader = catalogFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual(
      expect.arrayContaining([
        ansibleServiceFactory,
        rhaapOrganizationServiceFactory,
        catalogModuleRhaap,
      ]),
    );
    expect(features).toHaveLength(4);
    expect(features).toContainEqual(
      expect.objectContaining({
        service: userProvisionerRef,
        featureType: 'service',
      }),
    );
  });
});
