import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import catalogFeatureLoader from './index';
import { catalogModuleRhaap } from './module';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('catalog backend feature loader', () => {
  it('yields the AAP client factory and catalog module', async () => {
    const loader = catalogFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([ansibleServiceFactory, catalogModuleRhaap]);
  });
});
