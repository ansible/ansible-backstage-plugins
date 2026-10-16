import { createPlugin } from '@backstage/core-plugin-api';

/**
 * The portal-core plugin.
 *
 * This plugin has no UI — its sole purpose is to act as the singleton
 * provider for `@ansible/portal-extension-api` and
 * `@ansible/portal-extension-host` in RHDH dynamic plugin deployments.
 *
 * **How the singleton works:**
 * When RHDH loads portal-core via module federation, it bundles
 * `portal-extension-api` into portal-core's remote. Any plugin that
 * declares `@ansible/portal-extension-api` as a `peerDependency` receives
 * this same instance from the federation runtime — ensuring all plugins
 * share one `ContributionRegistry`.
 *
 * **Load order requirement:**
 * portal-core MUST appear before any portal content plugin
 * (self-service, APME's plugin, etc.) in `dynamic-plugins.yaml`.
 */
export const portalCorePlugin = createPlugin({
  id: 'portal-core',
});
