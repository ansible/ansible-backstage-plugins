import {
  createBackendPlugin,
  createServiceRef,
} from '@backstage/backend-plugin-api';
import { startTestBackend } from '@backstage/backend-test-utils';
import type {
  PortalHealth,
  PortalOperations,
  PortalEntitlements,
  CatalogEntityProvidersService,
  CatalogStatusSourcesService,
} from '@ansible/portal-plugin-node';
import loader from './alpha';

describe('dynamic root service ownership', () => {
  it('shares registries across independently constructed service references', async () => {
    const instances: Array<{
      health: PortalHealth;
      operations: PortalOperations;
      entitlements: PortalEntitlements;
      providers: CatalogEntityProvidersService;
      statuses: CatalogStatusSourcesService;
    }> = [];
    const contributor = (pluginId: string) =>
      createBackendPlugin({
        pluginId,
        register(reg) {
          reg.registerInit({
            deps: {
              health: createServiceRef<PortalHealth>({
                id: 'portal.health',
                scope: 'root',
              }),
              operations: createServiceRef<PortalOperations>({
                id: 'portal.operations',
                scope: 'root',
              }),
              entitlements: createServiceRef<PortalEntitlements>({
                id: 'portal.entitlements',
                scope: 'root',
              }),
              statuses: createServiceRef<CatalogStatusSourcesService>({
                id: 'portal.catalog-status-sources',
                scope: 'root',
              }),
              providers: createServiceRef<CatalogEntityProvidersService>({
                id: 'portal.catalog-entity-providers',
                scope: 'root',
              }),
            },
            async init(services) {
              instances.push(services);
            },
          });
        },
      });
    const backend = await startTestBackend({
      features: [loader, contributor('one'), contributor('two')],
    });
    try {
      expect(instances).toHaveLength(2);
      expect(instances[0].health).toBe(instances[1].health);
      expect(instances[0].operations).toBe(instances[1].operations);
      expect(instances[0].entitlements).toBe(instances[1].entitlements);
      expect(instances[0].providers).toBe(instances[1].providers);
      expect(instances[0].statuses).toBe(instances[1].statuses);
      instances[0].statuses.register({
        id: 'example.sync',
        source: {
          isReady: () => true,
          getStatus: () => ({ syncInProgress: false, providers: [] }),
        },
      });
      expect(instances[1].statuses.get('example.sync').getStatus()).toEqual({
        syncInProgress: false,
        providers: [],
      });
      instances[0].providers.register({
        id: 'example.resources',
        provider: {
          isReady: () => false,
          async withEntityMutation() {
            throw new Error('Not connected');
          },
        },
      });
      expect(instances[1].providers.get('example.resources').isReady()).toBe(
        false,
      );
      instances[0].health
        .forPlugin('apme')
        .push({ state: 'READY', message: 'Ready' });
      expect(instances[1].health.snapshot().apme.state).toBe('READY');
    } finally {
      await backend.stop();
    }
  });
});
