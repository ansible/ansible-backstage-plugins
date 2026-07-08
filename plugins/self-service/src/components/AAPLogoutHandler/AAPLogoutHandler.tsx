import { useEffect, useRef } from 'react';
import {
  identityApiRef,
  configApiRef,
  discoveryApiRef,
  useApi,
} from '@backstage/core-plugin-api';

const patchedApis = new WeakSet<object>();

export const AAPLogoutHandler = () => {
  const identityApi = useApi(identityApiRef);
  const config = useApi(configApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const originalRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (patchedApis.has(identityApi)) return undefined;
    patchedApis.add(identityApi);

    const aapHost = config
      .getOptionalString('ansible.rhaap.baseUrl')
      ?.replace(/\/$/, '');
    const originalSignOut = identityApi.signOut.bind(identityApi);
    originalRef.current = originalSignOut;

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

        try {
          await originalSignOut();
        } catch {
          // continue with AAP gateway logout regardless
        }

        try {
          const validatedUrl = new URL(aapHost);
          window.location.href = `${validatedUrl.origin}/api/gateway/v1/logout/`;
        } catch {
          window.location.href = '/';
        }
      } else {
        await originalSignOut();
      }
    };

    return () => {
      patchedApis.delete(identityApi);
      if (originalRef.current) {
        identityApi.signOut = originalRef.current;
      }
    };
  }, [identityApi, config, discoveryApi]);

  return null;
};
