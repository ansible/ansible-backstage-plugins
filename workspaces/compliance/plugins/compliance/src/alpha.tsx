import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { compatWrapper } from '@backstage/core-compat-api';
import SecurityIcon from '@material-ui/icons/Security';
import { complianceApiFactory } from './api/complianceApiFactory';
import { rootRouteRef } from './routes';

/**
 * New frontend system (NFS) wiring for the Compliance plugin.
 *
 * `ComplianceRouter` already owns its own nested routing (scan, results,
 * remediation, etc.) and self-gates on `ansible.compliance.enabled` via
 * `useComplianceEnabled()`, so a single page extension is enough here — the
 * host's `PageBlueprint` runtime mounts it at `/compliance/*` automatically.
 */
const compliancePlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'compliance',
  routes: {
    root: rootRouteRef,
  },
  extensions: [
    ApiBlueprint.make({
      name: 'compliance',
      params: define => define(complianceApiFactory),
    }),
    PageBlueprint.make({
      name: 'compliance',
      params: {
        path: '/compliance',
        // Required for sidebar nav-item auto-discovery: without a routeRef,
        // the page extension produces no `core.routing.ref` output, so the
        // host's NavContentNavItem discovery silently drops it — the route
        // still mounts and renders fine, it just never appears in the sidebar.
        routeRef: rootRouteRef,
        title: 'Compliance',
        icon: <SecurityIcon />,
        noHeader: true,
        loader: async () => {
          const { ComplianceRouter } = await import(
            './components/ComplianceRouter'
          );
          return compatWrapper(<ComplianceRouter />);
        },
      },
    }),
  ],
});

export default compliancePlugin;
