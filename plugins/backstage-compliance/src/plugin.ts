import {
  createPlugin,
  createRoutableExtension,
  createApiFactory,
  createApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';
import { complianceApiRef } from './api/complianceApiRef';
import { ComplianceBackendClient } from './api/ComplianceBackendClient';
import type { AapAuthApi } from './api/ComplianceBackendClient';

/**
 * Optional API ref for AAP authentication.
 *
 * When the compliance plugin runs inside the Ansible Portal (RHDH),
 * the Portal provides rhAapAuthApiRef which implements AapAuthApi.
 * The compliance plugin declares its own ref with the same ID so it
 * can optionally consume it without depending on
 * @ansible/plugin-backstage-self-service.
 *
 * If the API is not registered (standalone dev mode), the factory
 * falls back to undefined and the backend uses the service token.
 */
export const aapAuthApiRef = createApiRef<AapAuthApi>({
  id: 'plugin.rhaap.auth',
});

export const compliancePlugin = createPlugin({
  id: 'compliance',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: complianceApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) => {
        // Try to resolve the AAP auth API. In the Portal context,
        // this is registered by the auth-backend-module-rhaap-provider.
        // In standalone dev, it is not registered and we pass undefined.
        //
        // Note: Backstage API factories don't support optional deps
        // directly. The aapAuthApi is resolved at request time in
        // ComplianceBackendClient.getAapToken() via the injected ref.
        // For now, we construct without it and let the Portal register
        // it separately if available.
        return new ComplianceBackendClient({ discoveryApi, fetchApi });
      },
    }),
  ],
});

export const CompliancePage = compliancePlugin.provide(
  createRoutableExtension({
    name: 'CompliancePage',
    component: () =>
      import('./components/ComplianceRouter').then(m => m.ComplianceRouter),
    mountPoint: rootRouteRef,
  }),
);
