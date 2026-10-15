import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import {
  portalOperationsServiceRef,
  portalEntitlementsServiceRef,
  portalActiveOrganizationServiceRef,
} from '@ansible/portal-plugin-node';
import { CatalogClient } from '@backstage/catalog-client';
import { createRouter } from './router';
import { createEntitlementsRouter } from './entitlements/router';

export default createBackendPlugin({
  pluginId: 'portal-operations',
  register(env) {
    env.registerInit({
      deps: {
        operations: portalOperationsServiceRef,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        permissions: coreServices.permissions,
        entitlements: portalEntitlementsServiceRef,
        organizations: portalActiveOrganizationServiceRef,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
      },
      async init({ httpRouter, ...options }) {
        // Express 4/5 declaration variance at the Backstage router seam.
        httpRouter.use(
          createRouter(options) as unknown as Parameters<
            typeof httpRouter.use
          >[0],
        );
        httpRouter.use(
          createEntitlementsRouter({
            ...options,
            catalog: new CatalogClient({ discoveryApi: options.discovery }),
          }) as unknown as Parameters<typeof httpRouter.use>[0],
        );
      },
    });
  },
});
