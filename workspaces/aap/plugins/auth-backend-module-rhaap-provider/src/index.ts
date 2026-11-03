/***/
/**
 * The rhaap-provider backend module for the auth plugin.
 *
 * @packageDocumentation
 */

import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import { authModuleRhaapProvider } from './module';

export { aapAuthAuthenticator } from './authenticator';
export { AAPAuthSignInResolvers } from './resolvers';
export { authModuleRhaapProvider };

/** Register the transitional AAP client factory alongside the auth module. */
export default createBackendFeatureLoader({
  loader: function* () {
    yield ansibleServiceFactory;
    yield authModuleRhaapProvider;
  },
});
