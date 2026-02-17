import {
  identityApiRef,
  errorApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '../../apis';
import MenuItem from '@material-ui/core/MenuItem';

export const AAPLogoutButton = () => {
  const identityApi = useApi(identityApiRef);
  const errorApi = useApi(errorApiRef);
  const rhAapAuthApi = useApi(rhAapAuthApiRef);

  const handleLogout = async () => {
    try {
      // Revoke AAP OAuth token via backend /api/auth/rhaap/logout
      await rhAapAuthApi.signOut();
    } catch {
      // Ignore if not logged into AAP
    }

    // Sign out from primary identity provider
    identityApi.signOut().catch(error => errorApi.post(error));
  };

  return <MenuItem onClick={handleLogout}>Sign out</MenuItem>;
};
