import {
  createBackendModule,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { startTestBackend } from '@backstage/backend-test-utils';
import {
  catalogProcessingExtensionPoint,
  type EntityProvider,
  type EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import {
  portalCatalogEntityProvidersServiceRef,
  type CatalogEntityProvidersService,
} from '@ansible/portal-plugin-node';
import { catalogModuleEEProvider, EE_CATALOG_PROVIDER_ID } from './module';

it('registers a ready EE provider with the catalog and provider registry', async () => {
  const providers: EntityProvider[] = [];
  const registries: CatalogEntityProvidersService[] = [];
  const providerConnection = {
    applyMutation: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn(),
  } as EntityProviderConnection;
  const catalogHost = createBackendPlugin({
    pluginId: 'catalog',
    register(reg) {
      reg.registerExtensionPoint(catalogProcessingExtensionPoint, {
        addProcessor: jest.fn(),
        addPlaceholderResolver: jest.fn(),
        setOnProcessingErrorHandler: jest.fn(),
        addEntityProvider: (...added) => {
          const addedProviders = added.flat();
          providers.push(...addedProviders);
          for (const provider of addedProviders) {
            void provider.connect(providerConnection);
          }
        },
      });
      reg.registerInit({ deps: {}, async init() {} });
    },
  });
  const registryProbe = createBackendModule({
    pluginId: 'catalog',
    moduleId: 'ee-provider-test',
    register(reg) {
      reg.registerInit({
        deps: { registry: portalCatalogEntityProvidersServiceRef },
        async init({ registry }) {
          registries.push(registry);
        },
      });
    },
  });
  const backend = await startTestBackend({
    features: [catalogHost, catalogModuleEEProvider, registryProbe],
  });

  try {
    expect(providers.map(provider => provider.getProviderName())).toEqual([
      'EEEntityProvider',
    ]);
    expect(registries[0].get(EE_CATALOG_PROVIDER_ID).isReady()).toBe(true);
  } finally {
    await backend.stop();
  }
});
