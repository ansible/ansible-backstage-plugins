import catalogFeatureLoader, { catalogModuleContentDevelopment } from './index';
import { eeEntityProviderServiceFactory } from './eeEntityProviderService';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('content-development catalog feature loader', () => {
  it('provides the EE provider service and catalog module', async () => {
    const loader = catalogFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([
      eeEntityProviderServiceFactory,
      catalogModuleContentDevelopment,
    ]);
  });
});
