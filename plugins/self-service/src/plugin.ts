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
  templatesRouteRef,
  historyRouteRef,
} from './routes';
import { AAPApis, AapAuthApi, EEBuildApis } from './apis';

export const selfServicePlugin = createPlugin({
  id: 'self-service',
  apis: [AAPApis, AapAuthApi, EEBuildApis],
  routes: {
    root: rootRouteRef,
    ee: eeRouteRef,
    collections: collectionsRouteRef,
    gitRepositories: gitRepositoriesRouteRef,
    templates: templatesRouteRef,
    history: historyRouteRef,
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
 * Custom logout button that revokes the AAP OAuth token,
 * ends the AAP browser session, and signs out of Backstage.
 *
 * @public
 */
export const AAPLogoutButton = selfServicePlugin.provide(
  createComponentExtension({
    name: 'AAPLogoutButton',
    component: {
      lazy: () =>
        import('./components/AAPLogoutButton').then(m => m.AAPLogoutButton),
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
      import('./components/ExecutionEnvironments').then(m => m.EERoutesPage),
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
 * Templates page component for mounting at /self-service
 * Contains routing for all ansible.templates.view gated paths:
 * catalog, catalog/:namespace/:templateName, and create/templates/:namespace/:templateName.
 *
 * @public
 */
export const TemplatesPage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'TemplatesPage',
    component: () =>
      import('./components/Home').then(m => m.TemplatesRoutesPage),
    mountPoint: templatesRouteRef,
  }),
);

/**
 * History page component for mounting at /self-service/create/tasks
 * Contains routing for the History (task list and task detail) section.
 *
 * @public
 */
export const HistoryPage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'HistoryPage',
    component: () =>
      import('./components/TaskList').then(m => m.HistoryRoutesPage),
    mountPoint: historyRouteRef,
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

/**
 * A sidebar item that checks Templates permissions before rendering.
 * Returns null if the user doesn't have permission, hiding the sidebar entry.
 *
 * @public
 */
export const TemplatesSidebarItem = selfServicePlugin.provide(
  createComponentExtension({
    name: 'TemplatesSidebarItem',
    component: {
      lazy: () =>
        import('./components/SidebarItems').then(m => m.TemplatesSidebarItem),
    },
  }),
);

/**
 * A sidebar item that checks History permissions before rendering.
 * Returns null if the user doesn't have permission, hiding the sidebar entry.
 *
 * @public
 */
export const HistorySidebarItem = selfServicePlugin.provide(
  createComponentExtension({
    name: 'HistorySidebarItem',
    component: {
      lazy: () =>
        import('./components/SidebarItems').then(m => m.HistorySidebarItem),
    },
  }),
);
