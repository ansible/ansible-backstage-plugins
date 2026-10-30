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
import { portalScaffolderRoutePaths } from '@ansible/portal-scaffolder-common';
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
    // EE and Collections NFS pages are intentionally absent: the
    // automation-content plugin serves both at these paths (provisional
    // 2026-10-30 mounts, pending the workspace-ownership consult). Main's
    // portal-scaffolder-common route paths claim the same URLs — that
    // collision is tracked for the Ganesh/portal-team discussion.
    PageBlueprint.make({
      name: 'repositories',
      params: {
        path: portalScaffolderRoutePaths.gitRepositories,
        title: 'Git repositories',
        icon: <GitHubIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(gitRepositoriesRouteRef),
        loader: async () => {
          const { GitRepositoriesRoutesPage } = await import(
            './components/GitRepositories'
          );
          return compatWrapper(<GitRepositoriesRoutesPage />);
        },
      },
    }),
    createPortalScaffolderPage({
      path: portalScaffolderRoutePaths.root,
      routeRef: convertLegacyRouteRef(rootRouteRef),
      loader: async fields => {
        const { NativeScaffolderPage } = await import(
          './components/NativeScaffolderPage'
        );
        return compatWrapper(<NativeScaffolderPage declarations={fields} />);
      },
    }),
    PageBlueprint.make({
      name: 'history',
      params: {
        path: portalScaffolderRoutePaths.history,
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
