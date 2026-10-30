import {
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import { complianceApiRef } from './complianceApiRef';
import { ComplianceBackendClient } from './ComplianceBackendClient';

/**
 * Shared API factory for the `complianceApiRef`.
 *
 * Reused by both the legacy plugin wiring (`plugin.ts`) and the new frontend
 * system wiring (`alpha.tsx`) so the two app shells never drift apart.
 */
export const complianceApiFactory = createApiFactory({
  api: complianceApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
    aapAuthApi: rhAapAuthApiRef,
  },
  factory: ({ discoveryApi, fetchApi, aapAuthApi }) =>
    new ComplianceBackendClient({ discoveryApi, fetchApi, aapAuthApi }),
});
