import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import authFeatureLoader from './index';
import { authModuleRhaapProvider } from './module';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('auth backend feature loader', () => {
  it('yields the AAP client factory and auth module', async () => {
    const loader = authFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([ansibleServiceFactory, authModuleRhaapProvider]);
  });
});
