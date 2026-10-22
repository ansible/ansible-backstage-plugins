import {
  createFrontendPlugin,
  ApiBlueprint,
  PageBlueprint,
  AppRootElementBlueprint,
} from '@backstage/frontend-plugin-api';
import CssBaseline from '@material-ui/core/CssBaseline';
import { compatWrapper } from '@backstage/core-compat-api';
import { createPortalContributionProvider } from '@ansible/portal-extension-host/alpha';
import {
  portalOperationsApiFactory,
  portalEntitlementsApiFactory,
} from '@ansible/portal-extension-api';

/** NFS host: contribution ownership belongs to `portal`, not a contributor. */
export default createFrontendPlugin({
  pluginId: 'portal',
  extensions: [
    // The active theme owns font faces and body styles in both app shells.
    AppRootElementBlueprint.make({
      name: 'theme-baseline',
      params: { element: compatWrapper(<CssBaseline />) },
    }),
    PageBlueprint.make({
      name: 'landing',
      params: {
        path: '/',
        noHeader: true,
        loader: async () => {
          const { PortalLandingPage } = await import('./PortalLandingPage');
          return compatWrapper(<PortalLandingPage />);
        },
      },
    }),
    createPortalContributionProvider(),
    ApiBlueprint.make({
      name: 'operations',
      params: define => define(portalOperationsApiFactory),
    }),
    ApiBlueprint.make({
      name: 'entitlements',
      params: define => define(portalEntitlementsApiFactory),
    }),
  ],
});
