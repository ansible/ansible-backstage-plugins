import { useEffect } from 'react';
import {
  identityApiRef,
  configApiRef,
  discoveryApiRef,
  useApi,
} from '@backstage/core-plugin-api';

/**
 * Invisible component that patches identityApi.signOut() to include
 * AAP OAuth token revocation and gateway session cleanup.
 *
 * Mounted as an application/listener so any logout trigger (including
 * the global-header's default LogoutButton) performs the full AAP
 * logout flow.
 *
 * Uses discoveryApi + fetch to revoke the AAP OAuth token directly
 * via the auth backend, avoiding any dependency on rhAapAuthApiRef
 * which may not be registered in the dynamic-plugin context.
 */
export const AAPLogoutHandler = () => {
  const identityApi = useApi(identityApiRef);
  const config = useApi(configApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  useEffect(() => {
    const aapHost = config
      .getOptionalString('ansible.rhaap.baseUrl')
      ?.replace(/\/$/, '');
    const originalSignOut = identityApi.signOut.bind(identityApi);

    identityApi.signOut = async () => {
      if (aapHost) {
        try {
          const baseUrl = await discoveryApi.getBaseUrl('auth');
          await fetch(`${baseUrl}/rhaap/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          // Ignore — user may not have an active AAP session
        }

        originalSignOut().catch(() => {});

        window.location.href = `${aapHost}/api/gateway/v1/logout/`;
      } else {
        await originalSignOut();
      }
    };

    return () => {
      identityApi.signOut = originalSignOut;
    };
  }, [identityApi, config, discoveryApi]);

  return null;
};
