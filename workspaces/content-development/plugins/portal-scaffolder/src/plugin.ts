import {
  createComponentExtension,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  rootRouteRef,
  eeRouteRef,
  templatesRouteRef,
  historyRouteRef,
} from './routes';
import { AAPApis, EEBuildApis } from './apis';

export const selfServicePlugin = createPlugin({
  id: 'portal-scaffolder',
  apis: [AAPApis, EEBuildApis],
  routes: {
    root: rootRouteRef,
    ee: eeRouteRef,
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

export const AppThemeFixer = selfServicePlugin.provide(
  createComponentExtension({
    name: 'AppThemeFixer',
    component: {
      lazy: () =>
        import('./components/AppThemeFixer').then(m => m.AppThemeFixer),
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
 * Compatibility page for dynamic-plugin manifests that still reference
 * HistoryPage. It renders task details only; the History list was removed.
 *
 * Keep until all host manifests migrate away from HistoryPage.
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
 * Compatibility extension for dynamic-plugin manifests that still reference
 * HistorySidebarItem. The component intentionally renders nothing.
 *
 * Keep until all host manifests migrate away from HistorySidebarItem.
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
