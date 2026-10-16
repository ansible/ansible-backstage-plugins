import {
  createBackendPlugin,
  createServiceRef,
} from '@backstage/backend-plugin-api';
import { startTestBackend } from '@backstage/backend-test-utils';
import type {
  PortalHealth,
  PortalOperations,
  PortalEntitlements,
} from '@ansible/portal-plugin-node';
import loader from './alpha';

describe('dynamic root service ownership', () => {
  it('shares registries across independently constructed service references', async () => {
    const instances: Array<{
      health: PortalHealth;
      operations: PortalOperations;
      entitlements: PortalEntitlements;
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
      instances[0].health
        .forPlugin('apme')
        .push({ state: 'READY', message: 'Ready' });
      expect(instances[1].health.snapshot().apme.state).toBe('READY');
    } finally {
      await backend.stop();
    }
  });
});
