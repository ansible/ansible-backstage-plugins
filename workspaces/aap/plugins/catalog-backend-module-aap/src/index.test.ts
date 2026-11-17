import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import { resetCatalogModuleSliceGuardForTests } from '@ansible/backstage-rhaap-common/catalog';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog-backend';
import { signalsServiceRef } from '@backstage/plugin-signals-node';
import catalogModuleContent from '@ansible/backstage-plugin-catalog-backend-module-content';

import catalogAapFeatureLoader, { catalogModuleAap } from './index';
import catalogAapAlphaFeatureLoader from './alpha';

type BackendFeatureLoader = {
  featureType: string;
  loader: (deps: Record<string, never>) => Promise<unknown[]>;
};

const mockSignalsServiceFactory = createServiceFactory({
  service: signalsServiceRef,
  deps: {},
  factory: () => ({
    publish: async () => undefined,
  }),
});

const splitBackendConfig = mockServices.rootConfig.factory({
  data: {
    ansible: {
      rhaap: {
        baseUrl: 'https://aap.example.test',
        token: 'test-token',
        checkSSL: false,
      },
    },
    backend: {
      baseUrl: 'http://localhost:7007',
    },
  },
});

describe('catalog AAP feature loader', () => {
  beforeEach(() => {
    resetCatalogModuleSliceGuardForTests();
  });

  it('yields the AAP client factory and AAP catalog module', async () => {
    const loader = catalogAapFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual([ansibleServiceFactory, catalogModuleAap]);
  });

  it('starts the AAP catalog module without the deprecated rhaap shim', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        catalogAapFeatureLoader,
        mockSignalsServiceFactory,
        splitBackendConfig,
      ],
    });

    try {
      expect(backend.server.listening).toBe(true);
    } finally {
      await backend.stop();
    }
  });

  it('starts AAP and content split modules together without the deprecated shim', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        catalogAapFeatureLoader,
        catalogModuleContent,
        mockSignalsServiceFactory,
        splitBackendConfig,
      ],
    });

    try {
      expect(backend.server.listening).toBe(true);
    } finally {
      await backend.stop();
    }
  });
});

describe('catalog AAP alpha feature loader', () => {
  it('yields the AAP factory, JIT provisioner factory, and AAP module', async () => {
    const loader =
      catalogAapAlphaFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toHaveLength(3);
    expect(features[0]).toBe(ansibleServiceFactory);
    expect(features[2]).toBe(catalogModuleAap);
  });

  it('starts the alpha loader with the JIT user provisioner factory', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        catalogAapAlphaFeatureLoader,
        mockSignalsServiceFactory,
        splitBackendConfig,
      ],
    });

    try {
      expect(backend.server.listening).toBe(true);
    } finally {
      await backend.stop();
    }
  });
});
