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
import ExtensionIcon from '@material-ui/icons/Extension';
import {
  eeRouteRef,
  eeDetailsRouteRef,
  collectionsRouteRef,
  collectionDetailsRouteRef,
} from './routes';

function LegacyEEDetailsRedirect() {
  const { ref } = useParams();
  return <Navigate to={`/content/ee/${encodeURIComponent(ref!)}`} replace />;
}

function LegacyCollectionDetailsRedirect() {
  const { namespace, name } = useParams();
  return (
    <Navigate
      to={`/content/collections/${encodeURIComponent(
        namespace!,
      )}/${encodeURIComponent(name!)}`}
      replace
    />
  );
}

/** Native discovery lets hosts mount content catalogs without legacy app wiring. */
export const automationContentPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'automation-content',
  title: 'Automation content',
  routes: {
    ee: convertLegacyRouteRef(eeRouteRef),
    eeDetails: convertLegacyRouteRef(eeDetailsRouteRef),
    collections: convertLegacyRouteRef(collectionsRouteRef),
    collectionDetails: convertLegacyRouteRef(collectionDetailsRouteRef),
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
          return compatWrapper(<ImagesTabContent />);
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
        // endorsed by Ganesh; portal-scaffolder remains untouched.
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
    PageBlueprint.make({
      name: 'collections',
      params: {
        // Content-workspace mount per the 2026-11-02 direction: the content
        // workspace owns the collections view at its own path, and
        // portal-scaffolder's legacy page coexists unconfigured.
        path: '/content/collections',
        title: 'Collections',
        icon: <ExtensionIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(collectionsRouteRef),
        loader: async () => {
          const { CollectionsRoutesPage } = await import(
            './components/CollectionsCatalog/CollectionsRoutesPage'
          );
          return compatWrapper(<CollectionsRoutesPage />);
        },
      },
    }),
    PageBlueprint.make({
      name: 'collections-redirect',
      params: {
        path: '/automation-content/collections',
        loader: async () =>
          compatWrapper(<Navigate to="/content/collections" replace />),
      },
    }),
    PageBlueprint.make({
      name: 'collection-details-redirect',
      params: {
        path: '/automation-content/collections/:namespace/:name',
        loader: async () => compatWrapper(<LegacyCollectionDetailsRedirect />),
      },
    }),
    PageBlueprint.make({
      name: 'collection-details',
      params: {
        path: '/content/collections/:namespace/:name',
        title: 'Collection details',
        noHeader: true,
        loader: async () => {
          const { CollectionDetailsPage } = await import(
            './components/CollectionsCatalog/CollectionDetailsPage'
          );
          return compatWrapper(<CollectionDetailsPage />);
        },
      },
    }),
  ],
});

export default automationContentPlugin;
