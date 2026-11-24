import authFeatureLoader, { authModuleRhaapProvider } from './index';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('auth backend feature loader', () => {
  it('yields only the auth module', async () => {
    const loader = authFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([authModuleRhaapProvider]);
  });
});
