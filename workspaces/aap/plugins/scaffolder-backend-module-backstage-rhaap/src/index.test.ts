import scaffolderFeatureLoader, { scaffolderModuleAnsible } from './index';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('scaffolder backend feature loader', () => {
  it('yields only the scaffolder module', async () => {
    const loader = scaffolderFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([scaffolderModuleAnsible]);
  });
});
