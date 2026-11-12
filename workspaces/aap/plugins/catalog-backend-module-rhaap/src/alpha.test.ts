import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import alphaFeatureLoader from './alpha';
import { catalogModuleRhaap } from './module';
import { rhaapOrganizationServiceFactory } from './rhaapOrganizationResolver';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('catalog alpha feature loader', () => {
  it('yields the AAP client factory with organization and catalog features', async () => {
    const loader = alphaFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toHaveLength(4);
    expect(features[0]).toBe(ansibleServiceFactory);
    expect(features[1]).toBe(rhaapOrganizationServiceFactory);
    expect(features[3]).toBe(catalogModuleRhaap);
  });
});
