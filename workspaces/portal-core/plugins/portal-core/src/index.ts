/**
 * @public
 *
 * portal-core — singleton provider for the Portal plugin extension system.
 *
 * Re-exports the full public API of `@ansible/portal-extension-api` and
 * `@ansible/portal-extension-host` so that content plugins have a single
 * import target. In RHDH, content plugins should declare these as
 * `peerDependencies` and import from this package.
 *
 * @example
 * // In a content plugin's dynamic/index.ts
 * import { registerGitRepoDetailTab, CONTENT_TYPES } from '@ansible/portal-extension-api';
 *
 * registerGitRepoDetailTab({
 *   id: 'my-plugin.my-tab',
 *   label: 'My Tab',
 *   component: lazy(() => import('./components/MyTab')),
 *   appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
 * });
 */
export { portalCorePlugin } from './plugin';

// Re-export the full extension API surface so plugins can optionally
// import from @ansible/portal-core rather than @ansible/portal-extension-api.
export * from '@ansible/portal-extension-api';

// Re-export the host components for use by the shell application.
export * from '@ansible/portal-extension-host';
