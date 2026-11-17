import { catalogModuleContent } from './module';
import catalogContentFeatureLoader from './index';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('catalog content feature loader', () => {
  it('yields the content catalog module without the AAP service factory', async () => {
    const loader =
      catalogContentFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([catalogModuleContent]);
  });
});
