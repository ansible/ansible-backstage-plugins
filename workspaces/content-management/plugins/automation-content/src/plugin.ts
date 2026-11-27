import {
  createRouteRef,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { automationContentApiFactory } from './api';
import { gitRepositoriesCatalogApiFactory } from './components/GitRepositories/gitRepositoriesCatalogApi';
import { rootRouteRef } from './routes';

const collectionsRouteRef = createRouteRef({
  id: 'automation-content.collections',
});
const gitRepositoriesRouteRef = createRouteRef({
  id: 'automation-content.git-repositories',
});

export const automationContentPlugin = createPlugin({
  id: 'automation-content',
  routes: {
    root: rootRouteRef,
    collections: collectionsRouteRef,
    gitRepositories: gitRepositoriesRouteRef,
  },
  apis: [automationContentApiFactory, gitRepositoriesCatalogApiFactory],
});

/** Mounted by `dynamicRoutes` config — by default at /automation-content. */
export const AutomationContentPage = automationContentPlugin.provide(
  createRoutableExtension({
    name: 'AutomationContentPage',
    component: () =>
      import('./components/AutomationContentPage').then(
        m => m.AutomationContentPage,
      ),
    mountPoint: rootRouteRef,
  }),
);

/** Mounted at `/self-service/collections` by local and dynamic-plugin hosts. */
export const AutomationContentCollectionsPage = automationContentPlugin.provide(
  createRoutableExtension({
    name: 'AutomationContentCollectionsPage',
    component: () =>
      import('./components/ContentCatalogRoutes').then(
        m => m.AutomationContentCollectionsPage,
      ),
    mountPoint: collectionsRouteRef,
  }),
);

/** Mounted at `/self-service/repositories` by local and dynamic-plugin hosts. */
export const AutomationContentGitRepositoriesPage =
  automationContentPlugin.provide(
    createRoutableExtension({
      name: 'AutomationContentGitRepositoriesPage',
      component: () =>
        import('./components/ContentCatalogRoutes').then(
          m => m.AutomationContentGitRepositoriesPage,
        ),
      mountPoint: gitRepositoriesRouteRef,
    }),
  );
