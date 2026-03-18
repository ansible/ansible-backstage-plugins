import {
  createComponentExtension,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  rootRouteRef,
  eeRouteRef,
  collectionsRouteRef,
  gitRepositoriesRouteRef,
} from './routes';
import { AAPApis, AapAuthApi } from './apis';

export const selfServicePlugin = createPlugin({
  id: 'self-service',
  apis: [AAPApis, AapAuthApi],
  routes: {
    root: rootRouteRef,
    ee: eeRouteRef,
    collections: collectionsRouteRef,
    gitRepositories: gitRepositoriesRouteRef,
  },
});

export const SelfServicePage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'SelfServicePage',
    component: () => import('./components/RouteView').then(m => m.RouteView),
    mountPoint: rootRouteRef,
  }),
);

/**
 * @public
 */
export const LocationListener = selfServicePlugin.provide(
  createComponentExtension({
    name: 'LocationListener',
    component: {
      lazy: () =>
        import('./components/LocationListener').then(m => m.LocationListener),
    },
  }),
);

/**
 * EE Page component for mounting at /self-service/ee
 * Contains its own routing for the EE section.
 *
 * @public
 */
export const EEPage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'EEPage',
    component: () =>
      import('./components/ExecutionEnvironments').then((m: any) => m.EETabs),
    mountPoint: eeRouteRef,
  }),
);

/**
 * Collections landing page component for mounting at /self-service/collections
 * Contains routing for the Collections Catalog section.
 *
 * @public
 */
export const CollectionsPage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'CollectionsPage',
    component: () =>
      import('./components/CollectionsCatalog').then(
        m => m.CollectionsRoutesPage,
      ),
    mountPoint: collectionsRouteRef,
  }),
);

/**
 * A sidebar item that checks EE Builder permissions before rendering.
 * Returns null if the user doesn't have permission, hiding the sidebar entry.
 *
 * @public
 */
export const EEBuilderSidebarItem = selfServicePlugin.provide(
  createComponentExtension({
    name: 'EEBuilderSidebarItem',
    component: {
      lazy: () =>
        import('./components/SidebarItems').then(m => m.EEBuilderSidebarItem),
    },
  }),
);

/**
 * A sidebar item that checks Collections permissions before rendering.
 * Returns null if the user doesn't have permission, hiding the sidebar entry.
 *
 * @public
 */
export const CollectionsSidebarItem = selfServicePlugin.provide(
  createComponentExtension({
    name: 'CollectionsSidebarItem',
    component: {
      lazy: () =>
        import('./components/SidebarItems').then(m => m.CollectionsSidebarItem),
    },
  }),
);

/**
 * Git Repositories page component for mounting at /self-service/repositories
 * Contains routing for the Git Repositories section.
 *
 * @public
 */
export const GitRepositoriesPage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'GitRepositoriesPage',
    component: () =>
      import('./components/GitRepositories').then(
        m => m.GitRepositoriesRoutesPage,
      ),
    mountPoint: gitRepositoriesRouteRef,
  }),
);

/**
 * A sidebar item that checks Git Repositories permissions before rendering.
 * Returns null if the user doesn't have permission, hiding the sidebar entry.
 *
 * @public
 */
export const GitRepositoriesSidebarItem = selfServicePlugin.provide(
  createComponentExtension({
    name: 'GitRepositoriesSidebarItem',
    component: {
      lazy: () =>
        import('./components/SidebarItems').then(
          m => m.GitRepositoriesSidebarItem,
        ),
    },
  }),
);
