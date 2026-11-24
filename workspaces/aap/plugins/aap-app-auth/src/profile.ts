import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { AppProfileMenuItemBlueprint } from '@ansible/portal-extension-api/alpha';
import {
  identityApiRef,
  configApiRef,
  errorApiRef,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from './api';

export function createAapLogoutProfileItem(disabled = true) {
  return AppProfileMenuItemBlueprint.make({
    name: 'aap-logout',
    disabled,
    params: {
      title: 'Sign out',
      type: 'action',
      order: 1000,
      authorization: { type: 'authenticated' },
      loadAction: async () => {
        const { performAapLogout } = await import('./logout');
        return async ({ apis }) => {
          const auth = apis.get(rhAapAuthApiRef);
          const identity = apis.get(identityApiRef);
          const config = apis.get(configApiRef);
          const errors = apis.get(errorApiRef);
          if (!auth || !identity || !config || !errors)
            throw new Error('AAP logout APIs are unavailable');
          await performAapLogout({ auth, identity, config, errors });
        };
      },
    },
  });
}

/** Source apps can install only the declaration without replacing their sign-in composition. */
export function createAapProfileModule({
  logoutDisabled = true,
}: { logoutDisabled?: boolean } = {}) {
  return createFrontendModule({
    pluginId: 'app',
    extensions: [createAapLogoutProfileItem(logoutDisabled)],
  });
}
