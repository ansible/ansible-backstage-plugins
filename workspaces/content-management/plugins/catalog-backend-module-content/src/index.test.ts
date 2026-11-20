import { catalogModuleContent } from './module';
import { catalogModuleEEProvider } from './ee-provider/module';
import catalogContentFeatureLoader, {
  contentCatalogRegistration,
} from './index';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('catalog content feature loader', () => {
  it('yields the content catalog module and EE provider without the AAP service factory', async () => {
    const loader =
      catalogContentFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([catalogModuleContent, catalogModuleEEProvider]);
  });

  it('re-exports contentCatalogRegistration', () => {
    expect(contentCatalogRegistration.createProviders).toEqual(
      expect.any(Function),
    );
  });
});
