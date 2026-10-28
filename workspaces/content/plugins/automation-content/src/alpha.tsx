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
import {
  rootRouteRef,
  eeRouteRef,
  eeDetailsRouteRef,
  collectionsRouteRef,
  collectionDetailsRouteRef,
} from './routes';

/** Native discovery lets hosts mount content catalogs without legacy app wiring. */
export const automationContentPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'automation-content',
  title: 'Automation content',
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
    ee: convertLegacyRouteRef(eeRouteRef),
    eeDetails: convertLegacyRouteRef(eeDetailsRouteRef),
    collections: convertLegacyRouteRef(collectionsRouteRef),
    collectionDetails: convertLegacyRouteRef(collectionDetailsRouteRef),
  },
  extensions: [
    ApiBlueprint.make({
      name: 'content',
      params: define => define(automationContentApiFactory),
    }),
    PageBlueprint.make({
      name: 'root',
      params: {
        path: '/automation-content',
        title: 'Automation content',
        noHeader: true,
        routeRef: convertLegacyRouteRef(rootRouteRef),
        loader: async () => {
          const { ContentLandingPage } = await import(
            './components/ContentLandingPage'
          );
          return compatWrapper(<ContentLandingPage />);
        },
      },
    }),
    PageBlueprint.make({
      name: 'ee',
      params: {
        path: '/automation-content/execution-environments',
        title: 'Execution Environments',
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
      name: 'collections',
      params: {
        path: '/automation-content/collections',
        title: 'Collections',
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
  ],
});

export default automationContentPlugin;
