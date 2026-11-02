import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { compatWrapper } from '@backstage/core-compat-api';
import { registerManifest } from '@ansible/portal-extension-api';
import SecurityIcon from '@material-ui/icons/Security';
import { complianceApiFactory } from './api/complianceApiFactory';
import { complianceManifest } from './complianceManifest';
import { rootRouteRef } from './routes';

/**
 * Declares compliance's capability contribution to the host.
 *
 * `registerManifest()` publishes `complianceManifest` to the host's
 * `ContributionRegistry`. The host's `DynamicExtensionDiscovery` (mounted
 * once in `portal-extension-host`) subscribes to this registry and
 * validates every registered manifest against its known experiences
 * (`EXPERIENCE_IDS`, including `'compliance'`) and host API
 * version, logging the result. This is a module-level side effect, so it
 * fires as soon as this NFS entry point loads — same mechanism APME's
 * `plugin.ts` uses (`registerManifest(apmeManifest)`), just invoked from
 * the NFS entry rather than the legacy one, since compliance has no legacy
 * `GitRepositoriesExtensionsApi`-style contract to migrate off of.
 *
 * This does not yet change how `ComplianceRouter` renders its own tabs —
 * see ADR-040 for the follow-up that re-platforms
 * ADR-027's Tier 1 widgets onto slot-targeted `CapabilityEntryPoint`s.
 */
registerManifest(complianceManifest);

/**
 * New frontend system (NFS) wiring for the Compliance plugin.
 *
 * `ComplianceRouter` already owns its own nested routing (scan, results,
 * remediation, etc.) and self-gates on `ansible.compliance.enabled` via
 * `useComplianceEnabled()`, so a single page extension is enough here — the
 * host's `PageBlueprint` runtime mounts it at `/compliance/*` automatically.
 *
 * This mirrors APME's own standalone `/self-service/content-quality` fleet
 * page (`backstage-apme/src/alpha.tsx`): a top-level `PageBlueprint` is the
 * correct shape for a capability that is not attached to a catalog entity.
 * Compliance's subjects are AAP inventories/hosts, not catalog content
 * types, so none of its surfaces use the entity-attached NFS blueprints
 * (`EntityDetailTabBlueprint`, `CatalogTabBlueprint`, etc.) APME uses for
 * its per-repository quality tabs — there is no entity to attach to.
 *
 * `compliance` is NOT statically imported by `AppNfs.tsx`; it is loaded
 * through `portal-core/packages/app/src/composition.ts`'s
 * `optionalContributorLoader`, the same dynamic `import()` mechanism APME
 * and RHAAP use. See the gap analysis §1.2 for why a static import in the
 * core app is the anti-pattern this fixes.
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
