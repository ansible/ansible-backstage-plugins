import {
  createFrontendModule,
  type FrontendModule,
} from '@backstage/frontend-plugin-api';
import { createAapSignInPageExtension } from './extensions/signInPage';

/** Opt-in AAP-only sign-in UI. Requires separate AAP API registration. */
export function createAapSignInModule(): FrontendModule {
  return createFrontendModule({
    pluginId: 'app',
    extensions: [createAapSignInPageExtension()],
  });
}
