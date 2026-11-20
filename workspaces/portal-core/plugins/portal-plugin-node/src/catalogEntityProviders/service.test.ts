import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { startTestBackend } from '@backstage/backend-test-utils';
import { portalCatalogEntityProvidersServiceRef } from './service';
import { PortalCatalogEntityProviders } from './registry';
import type {
  CatalogEntityProvider,
  CatalogEntityProvidersService,
} from './types';

describe('injected catalog entity providers', () => {
  it('shares provider discovery across independent plugins without init-order assumptions', async () => {
    const seen: CatalogEntityProvidersService[] = [];
    const implementation: CatalogEntityProvider = {
      isReady: () => false,
      withEntityMutation: async () => {
        throw new Error('Not connected');
      },
    };
    const feature = (pluginId: string, contribute: boolean) =>
      createBackendPlugin({
        pluginId,
        register(env) {
          env.registerInit({
            deps: { providers: portalCatalogEntityProvidersServiceRef },
            async init({ providers }) {
              seen.push(providers);
              if (contribute)
                providers.register({
                  id: 'example.resources',
                  provider: implementation,
                });
            },
          });
        },
      });
    const backend = await startTestBackend({
      features: [feature('consumer', false), feature('contributor', true)],
    });
    try {
      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(seen[1]);
      // Lookup occurs when needed, after backend init, not in consumer init.
      expect(seen[0].get('example.resources').isReady()).toBe(false);
    } finally {
      await backend.stop();
    }
  });

  it('does not share registrations between backend roots', () => {
    const first = new PortalCatalogEntityProviders();
    const second = new PortalCatalogEntityProviders();
    first.register({
      id: 'example.resources',
      provider: {
        isReady: () => false,
        withEntityMutation: async () => {
          throw new Error('Not connected');
        },
      },
    });
    expect(() => second.get('example.resources')).toThrow('not registered');
  });
});
