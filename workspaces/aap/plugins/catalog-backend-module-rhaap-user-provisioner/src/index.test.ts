import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import userProvisionerFeatureLoader from './index';
import { catalogModuleRhaapUserProvisioner } from './module';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('user-provisioner backend feature loader', () => {
  it('yields the AAP client factory and user-provisioner module', async () => {
    const loader =
      userProvisionerFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([
      ansibleServiceFactory,
      catalogModuleRhaapUserProvisioner,
    ]);
  });
});
