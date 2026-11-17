jest.mock('@ansible/backstage-rhaap-common/catalog', () => {
  const actual = jest.requireActual('@ansible/backstage-rhaap-common/catalog');
  return {
    ...actual,
    createRouter: jest.fn(async () => 'shared-router'),
  };
});

import {
  ansibleServiceFactory,
  userProvisionerRef,
} from '@ansible/backstage-rhaap-common';
import { createRouter as createSharedRouter } from '@ansible/backstage-rhaap-common/catalog';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog-backend';
import { signalsServiceRef } from '@backstage/plugin-signals-node';
import { resetCatalogModuleSliceGuardForTests } from '@ansible/backstage-rhaap-common/catalog';

import catalogFeatureLoader, {
  catalogModuleRhaap,
  createRouter,
} from './index';
import { rhaapOrganizationServiceFactory } from './rhaapOrganizationResolver';

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

describe('catalog backend feature loader', () => {
  beforeEach(() => {
    resetCatalogModuleSliceGuardForTests();
  });

  it('yields the AAP services and catalog module', async () => {
    const loader = catalogFeatureLoader as unknown as BackendFeatureLoader;

    expect(loader.featureType).toBe('loader');

    const features = await loader.loader({});
    expect(features).toEqual(
      expect.arrayContaining([
        ansibleServiceFactory,
        rhaapOrganizationServiceFactory,
        catalogModuleRhaap,
      ]),
    );
    expect(features).toHaveLength(4);
    expect(features).toContainEqual(
      expect.objectContaining({
        service: userProvisionerRef,
        featureType: 'service',
      }),
    );
  });

  it('starts the deprecated rhaap shim', async () => {
    const backend = await startTestBackend({
      features: [
        catalogPlugin,
        catalogFeatureLoader,
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

describe('createRouter wrapper', () => {
  beforeEach(() => {
    (createSharedRouter as jest.Mock).mockClear();
  });

  it('defaults slice to all for legacy callers', async () => {
    await expect(createRouter({ logger: 'test' } as any)).resolves.toBe(
      'shared-router',
    );
    expect(createSharedRouter).toHaveBeenCalledWith(
      expect.objectContaining({ logger: 'test', slice: 'all' }),
    );
  });

  it('preserves an explicit slice', async () => {
    await createRouter({ logger: 'test', slice: 'aap' } as any);
    expect(createSharedRouter).toHaveBeenCalledWith(
      expect.objectContaining({ slice: 'aap' }),
    );
  });
});
