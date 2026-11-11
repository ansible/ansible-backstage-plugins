import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import { automationContentApiFactory } from './apis';
import { CatalogTabBlueprint } from '@ansible/portal-extension-api/alpha';
import { automationContentManifest } from './pluginManifest';
import { Navigate, useParams } from 'react-router-dom';
import BuildIcon from '@material-ui/icons/Build';
import { eeRouteRef, eeDetailsRouteRef } from './routes';

function LegacyEEDetailsRedirect() {
  const { ref } = useParams();
  return <Navigate to={`/content/ee/${encodeURIComponent(ref!)}`} replace />;
}

/** Native discovery lets hosts mount content catalogs without legacy app wiring. */
export const automationContentPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'automation-content',
  title: 'Automation content',
  routes: {
    ee: convertLegacyRouteRef(eeRouteRef),
    eeDetails: convertLegacyRouteRef(eeDetailsRouteRef),
  },
  extensions: [
    CatalogTabBlueprint.make({
      name: 'images',
      params: {
        manifest: automationContentManifest,
        capabilityId: 'automation-content.discovery',
        entryPointId: 'automation-content.discovery.images-tab',
        attachment: 'catalog.tabs',
        loader: async () => {
          const { ImagesTabContent } = await import(
            './components/ExecutionEnvironments/EECatalogPage'
          );
          const { RequiresContentPermission } = await import(
            './components/common/RequiresContentPermission'
          );
          // Hosts that collect catalog.tabs mount this tab directly, outside
          // the route tree that applies the view permission on the EE pages.
          // Wrap here so the tab is gated the same way in every host.
          return compatWrapper(
            <RequiresContentPermission>
              <ImagesTabContent />
            </RequiresContentPermission>,
          );
        },
      },
    }),
    ApiBlueprint.make({
      name: 'content',
      params: define => define(automationContentApiFactory),
    }),
    PageBlueprint.make({
      name: 'content-redirect',
      params: {
        path: '/content',
        loader: async () =>
          compatWrapper(<Navigate to="/content/ee" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'root-redirect',
      params: {
        // Compatibility redirect: the plugin's original mount prefix.
        path: '/automation-content',
        loader: async () =>
          compatWrapper(<Navigate to="/content/ee" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'ee',
      params: {
        // Content-workspace mount at /content/ee per the 2026-11-02 sync,
        // endorsed by Ganesh; portal-scaffolder's old EE mounts now redirect here.
        path: '/content/ee',
        title: 'Execution Environments',
        icon: <BuildIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(eeRouteRef),
        loader: async () => {
          const { EERoutesPage } = await import(
            './components/ExecutionEnvironments/EERoutesPage'
          );
          return compatWrapper(<EERoutesPage />);
        },
      },
    }),
    PageBlueprint.make({
      name: 'ee-redirect',
      params: {
        path: '/automation-content/execution-environments',
        loader: async () =>
          compatWrapper(<Navigate to="/content/ee" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'ee-details-redirect',
      params: {
        path: '/automation-content/execution-environments/:ref',
        loader: async () => compatWrapper(<LegacyEEDetailsRedirect />),
      },
    }),
  ],
});

export default automationContentPlugin;
