import {
  identityApiRef,
  configApiRef,
  errorApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '../../apis';
import MenuItem from '@material-ui/core/MenuItem';

export const AAPLogoutButton = () => {
  const identityApi = useApi(identityApiRef);
  const errorApi = useApi(errorApiRef);
  const rhAapAuthApi = useApi(rhAapAuthApiRef);
  const config = useApi(configApiRef);

  const handleLogout = async () => {
    try {
      // Revoke AAP OAuth token via backend /api/auth/rhaap/logout
      await rhAapAuthApi.signOut();
    } catch {
      // Ignore if not logged into AAP
    }

    // Sign out from primary identity provider
    // This clears the local Backstage session state
    identityApi.signOut().catch(error => errorApi.post(error));

    // Redirect to AAP logout to end the AAP browser session.
    // This must be a top-level navigation so the browser sends the
    // gateway_sessionid cookie (SameSite=Lax).
    const aapHost = config
      .getOptionalString('ansible.rhaap.baseUrl')
      ?.replace(/\/+$/, '');
    if (aapHost) {
      window.location.href = `${aapHost}/api/gateway/v1/logout/`;
    }
  };

  return <MenuItem onClick={handleLogout}>Sign out</MenuItem>;
};
