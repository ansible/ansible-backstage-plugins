import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { startTestBackend } from '@backstage/backend-test-utils';
import { PortalHealth, portalHealthServiceRef } from './healthRegistry';
import { createPortalPlugin } from './createPortalPlugin';

describe('injected portal health', () => {
  it('shares push status across contributor and aggregator plugins', async () => {
    const instances: PortalHealth[] = [];
    const feature = (pluginId: string) =>
      createBackendPlugin({
        pluginId,
        register(env) {
          env.registerInit({
            deps: { health: portalHealthServiceRef },
            async init({ health }) {
              instances.push(health);
            },
          });
        },
      });
    const backend = await startTestBackend({
      features: [feature('contributor'), feature('aggregator')],
    });
    try {
      expect(instances).toHaveLength(2);
      expect(instances[0]).toBe(instances[1]);
      const plugin = createPortalPlugin({
        pluginId: 'apme',
        health: instances[0],
      });
      plugin.pushHealthStatus({ state: 'READY', message: 'Workers ready' });
      expect(instances[1].snapshot()).toEqual({
        apme: { state: 'READY', message: 'Workers ready' },
      });
      plugin.pushHealthStatus({
        state: 'DEGRADED',
        message: 'Worker unavailable',
      });
      expect(instances[1].snapshot().apme.state).toBe('DEGRADED');
    } finally {
      await backend.stop();
    }
  });
  it('isolates storage between backend roots', () => {
    const first = new PortalHealth();
    const second = new PortalHealth();
    first.forPlugin('apme').push({ state: 'READY', message: 'Ready' });
    expect(second.snapshot()).toEqual({});
  });
});
