import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import scaffolderFeatureLoader from './index';
import { scaffolderModuleAnsible } from './module';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

describe('scaffolder backend feature loader', () => {
  it('yields the AAP client factory and scaffolder module', async () => {
    const loader = scaffolderFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([ansibleServiceFactory, scaffolderModuleAnsible]);
  });
});
