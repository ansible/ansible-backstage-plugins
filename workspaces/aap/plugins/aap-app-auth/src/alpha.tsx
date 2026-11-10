import {
  createFrontendModule,
  type FrontendModule,
} from '@backstage/frontend-plugin-api';
import { createAapAuthApiExtension } from './extensions/authApi';
import { createAapSignInPageExtension } from './extensions/signInPage';
import { createAapLogoutProfileItem } from './profile';

/** Combined compatibility entry. Use /api-module for API-only host integration. */
const aapAppAuth: FrontendModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    createAapLogoutProfileItem(),
    createAapAuthApiExtension(),
    createAapSignInPageExtension(),
  ],
});
export default aapAppAuth;
