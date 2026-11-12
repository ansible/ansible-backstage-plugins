/***/
/**
 * The rhaap-provider backend module for the auth plugin.
 *
 * @packageDocumentation
 */

import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { authModuleRhaapProvider } from './module';

export { aapAuthAuthenticator } from './authenticator';
export { AAPAuthSignInResolvers } from './resolvers';
export { authModuleRhaapProvider };

/** Load the auth module; the catalog loader or host provides the AAP service. */
export default createBackendFeatureLoader({
  loader: function* () {
    yield authModuleRhaapProvider;
  },
});
