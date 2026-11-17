import {
  createFrontendModule,
  type FrontendModule,
} from '@backstage/frontend-plugin-api';
import { createAapAuthApiExtension } from './extensions/authApi';

/** Register the AAP API without changing host sign-in or profile UI. */
export function createAapAuthApiModule(): FrontendModule {
  return createFrontendModule({
    pluginId: 'app',
    extensions: [createAapAuthApiExtension()],
  });
}
