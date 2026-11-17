import {
  ApiBlueprint,
  PageBlueprint,
  SubPageBlueprint,
  createFrontendPlugin,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import { createPortalScaffolderPage } from '@ansible/portal-extension-host/alpha';
import { createPortalScaffolderFieldBlueprints } from '@ansible/portal-extension-api/alpha';
import { portalScaffolderRoutePaths } from '@ansible/portal-scaffolder-common';
import { AAPApis, EEBuildApis } from './apis';
import {
  rootRouteRef,
  collectionsRouteRef,
  gitRepositoriesRouteRef,
  historyRouteRef,
} from './routes';
import HomeIcon from '@material-ui/icons/Home';
import HistoryIcon from '@material-ui/icons/History';
import ExtensionIcon from '@material-ui/icons/Extension';
import GitHubIcon from '@material-ui/icons/GitHub';
import { selfServiceManifest } from './selfServiceManifest';

/** Native discovery and lifecycle around the existing Portal wizard. */
const portalScaffolderPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'portal-scaffolder',
  title: 'Templates',
  icon: <HomeIcon />,
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
    collections: convertLegacyRouteRef(collectionsRouteRef),
    repositories: convertLegacyRouteRef(gitRepositoriesRouteRef),
    history: convertLegacyRouteRef(historyRouteRef),
  },
  extensions: [
    ApiBlueprint.make({ name: 'aap', params: define => define(AAPApis) }),
    ApiBlueprint.make({
      name: 'ee-build',
      params: define => define(EEBuildApis),
    }),
    ...createPortalScaffolderFieldBlueprints('aap-resource-picker', {
      manifest: selfServiceManifest,
      capabilityId: 'portal-scaffolder.scaffolder-fields',
      entryPointId: 'portal-scaffolder.aap-resource-picker',
      attachment: 'scaffolder.fields',
      fieldName: 'AAPResourcePicker',
      loader: async () => {
        const { AAPResourcePicker } = await import(
          './components/Scaffolder/AAResourcePicker/AAPResourcePicker'
        );
        return { name: 'AAPResourcePicker', component: AAPResourcePicker };
      },
    }),
    ...createPortalScaffolderFieldBlueprints('collections-picker', {
      manifest: selfServiceManifest,
      capabilityId: 'portal-scaffolder.scaffolder-fields',
      entryPointId: 'portal-scaffolder.collections-picker',
      attachment: 'scaffolder.fields',
      fieldName: 'CollectionsPicker',
      loader: async () => {
        const { CollectionsPickerExtension } = await import(
          './components/Scaffolder/CollectionsPicker/CollectionsPickerExtension'
        );
        return {
          name: 'CollectionsPicker',
          component: CollectionsPickerExtension,
        };
      },
    }),
    PageBlueprint.make({
      name: 'collections',
      params: {
        path: portalScaffolderRoutePaths.collections,
        title: 'Collections',
        icon: <ExtensionIcon />,
        noHeader: true,
        routeRef: convertLegacyRouteRef(collectionsRouteRef),
        loader: async () => {
          const { CollectionsRoutesPage } = await import(
            './components/CollectionsCatalog'
          );
          return compatWrapper(<CollectionsRoutesPage />);
        },
      },
    }),
    SubPageBlueprint.make({
      name: 'ee-definitions',
      attachTo: { id: 'page:automation-content/ee', input: 'pages' },
      params: {
        path: 'definitions',
        title: 'Definitions',
        loader: async () => {
          const { EEDefinitionsTab } = await import(
            './components/ExecutionEnvironments/EEDefinitionsTab'
          );
          return compatWrapper(<EEDefinitionsTab />);
        },
      },
    }),
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
