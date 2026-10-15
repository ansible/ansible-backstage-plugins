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
import { createPortalScaffolderPage } from '@ansible/portal-extension-host/alpha';
import { AAPApis, EEBuildApis } from './apis';
import {
  rootRouteRef,
  collectionsRouteRef,
  eeRouteRef,
  gitRepositoriesRouteRef,
  historyRouteRef,
} from './routes';
import HomeIcon from '@material-ui/icons/Home';
import HistoryIcon from '@material-ui/icons/History';
import BuildIcon from '@material-ui/icons/Build';
import ExtensionIcon from '@material-ui/icons/Extension';
import GitHubIcon from '@material-ui/icons/GitHub';

/** Native discovery and lifecycle around the existing Portal wizard. */
const portalScaffolderPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'portal-scaffolder',
  title: 'Templates',
  icon: <HomeIcon />,
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
    collections: convertLegacyRouteRef(collectionsRouteRef),
    ee: convertLegacyRouteRef(eeRouteRef),
    repositories: convertLegacyRouteRef(gitRepositoriesRouteRef),
    history: convertLegacyRouteRef(historyRouteRef),
  },
  extensions: [
    ApiBlueprint.make({ name: 'aap', params: define => define(AAPApis) }),
    ApiBlueprint.make({
      name: 'ee-build',
      params: define => define(EEBuildApis),
    }),
    PageBlueprint.make({
      name: 'collections',
      params: {
        path: '/self-service/collections',
        title: 'Collections',
        icon: <ExtensionIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(collectionsRouteRef),
        loader: async () => {
          const { CollectionsRoutesPage } =
            await import('./components/CollectionsCatalog');
          return compatWrapper(<CollectionsRoutesPage />);
        },
      },
    }),
    PageBlueprint.make({
      name: 'ee',
      params: {
        path: '/self-service/ee',
        title: 'Execution Environments',
        icon: <BuildIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(eeRouteRef),
        loader: async () => {
          const { EERoutesPage } =
            await import('./components/ExecutionEnvironments');
          return compatWrapper(<EERoutesPage />);
        },
      },
    }),
    PageBlueprint.make({
      name: 'repositories',
      params: {
        path: '/self-service/repositories',
        title: 'Git repositories',
        icon: <GitHubIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(gitRepositoriesRouteRef),
        loader: async () => {
          const { GitRepositoriesRoutesPage } =
            await import('./components/GitRepositories');
          return compatWrapper(<GitRepositoriesRoutesPage />);
        },
      },
    }),
    createPortalScaffolderPage({
      path: '/self-service',
      routeRef: convertLegacyRouteRef(rootRouteRef),
      loader: async fields => {
        const { NativeScaffolderPage } =
          await import('./components/NativeScaffolderPage');
        return compatWrapper(<NativeScaffolderPage declarations={fields} />);
      },
    }),
    PageBlueprint.make({
      name: 'history',
      params: {
        path: '/self-service/create/tasks',
        title: 'History',
        icon: <HistoryIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(historyRouteRef),
        loader: async () => {
          const { HistoryRoutesPage } = await import('./components/TaskList');
          return compatWrapper(<HistoryRoutesPage />);
        },
      },
    }),
  ],
});
export default portalScaffolderPlugin;
