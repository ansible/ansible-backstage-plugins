import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { portalHealthServiceRef } from '@ansible/portal-plugin-node';

/**
 * The portal-health backend plugin.
 *
 * Exposes `GET /api/portal-health/status` — a JSON snapshot of every portal
 * plugin's current health state, aggregated from the process-level
 * `HealthRegistry` populated by `portal-plugin-node`'s `pushHealthStatus()`.
 *
 * Register this plugin in your backend:
 * ```ts
 * backend.add(import('@ansible/portal-health-backend'));
 * ```
 *
 * The frontend `PortalHealthStatus` component (from `portal-extension-host`)
 * calls this endpoint to render the health dashboard.
 */
export const portalHealthPlugin = createBackendPlugin({
  pluginId: 'portal-health',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        health: portalHealthServiceRef,
      },
      async init({ httpRouter, logger, health }) {
        logger.info('portal-health: starting health aggregation endpoint');
        // express-promise-router vs passport/node_modules/@types/express-serve-static-core
        // variance causes a spurious type mismatch; the runtime value is valid.
        // @ts-expect-error See above
        httpRouter.use(createRouter(health));
      },
    });
  },
});
