import { useCallback } from 'react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef, SELF_SERVICE_ROOT_PATH } from '../routes';

/**
 * Base path for self-service links (`/self-service` on standard deployments).
 *
 * On Scalprum (RHDH 1.10), `rootRouteRef` is bound at the plugin mount. On RHDH 2.1
 * NFS, EE/collections/git/templates use separate PageBlueprints that do not bind
 * `rootRouteRef`, so `useRouteRef(rootRouteRef)` throws without `optional` + fallback.
 */
export function useSelfServiceRootLink(): () => string {
  const link = useRouteRef(rootRouteRef);
  return useCallback(
    () => (typeof link === 'function' ? link() : SELF_SERVICE_ROOT_PATH),
    [link],
  );
}
