// ── UI contribution types (PoC registry model) ────────────────────────────────
// Used by the lower-level ContributionRegistry API (registerTab/registerCard/
// registerAction). These are the backward-compatible PoC types. In Phase 4
// they will be wrapped by CapabilityContribution + CapabilityEntryPoint.
import { contributionRegistry as _registry } from './registry';

export {
  portalOperationsApiRef,
  portalOperationsApiFactory,
  PortalOperationsClient,
} from './operations';
export type { PortalOperationsApi } from './operations';

export type {
  ContributionComponent,
  ActionContext,
  TabContribution,
  CardContribution,
  ActionContribution,
  CapabilityLaunch,
  CapabilityLaunchType,
  SlotLaunch,
  WorkflowLaunch,
  OperationLaunch,
} from './types';

// ── Manifest-level types (experience + capability + entry point model) ─────────
// These are the production types from §6.3 of the Content Experience
// Architecture. They supersede the PoC registry model for new plugins.
export type {
  PermissionRequirement,
  ContentPredicate,
  ExperienceDefinition,
  ContributionKind,
  EntrySurface,
  CapabilityEntryPoint,
  CapabilityContribution,
  SettingsContribution,
  EntitlementDefinition,
  OperationDescriptor,
  PluginManifest,
} from './manifest';

// ── Extension point IDs, experience IDs, content type IDs ────────────────────
export {
  EXTENSION_POINTS,
  EXPERIENCE_IDS,
  CONTENT_TYPES,
} from './extensionPoints';
export type {
  ExtensionPointId,
  ExperienceId,
  ContentTypeId,
} from './extensionPoints';

// ── Registry singleton + type ─────────────────────────────────────────────────
export { contributionRegistry } from './registry';
export type { ContributionRegistry } from './registry';

/**
 * Registers a plugin manifest with the host's `ContributionRegistry`.
 *
 * Call this from your plugin's `dynamic/index.ts` alongside your `register*`
 * calls. `DynamicExtensionDiscovery` subscribes to the registry and validates
 * each arriving manifest, logging the result.
 *
 * @example
 * // In your plugin's dynamic/index.ts
 * import { registerManifest, registerGitRepoDetailTab } from '@ansible/portal-extension-api';
 * registerManifest(myPluginManifest);
 * registerGitRepoDetailTab({ id: 'my-plugin.trust-signals', ... });
 */
export function registerManifest(
  manifest: import('./manifest').PluginManifest,
): void {
  _registry.registerManifest(manifest);
}

// ── React hooks (tree-shaken if unused) ───────────────────────────────────────
export {
  useExtensionTabs,
  useExtensionCards,
  useExtensionActions,
} from './hooks';

// ── Convenience registration helpers ─────────────────────────────────────────
export * from './helpers';
export {
  registerScaffolderField,
  mergeScaffolderFields,
  useScaffolderFields,
} from './scaffolderFields';
export type { ScaffolderFieldContribution } from './scaffolderFields';
export {
  portalEntitlementsApiRef,
  portalEntitlementsApiFactory,
  PortalEntitlementsClient,
} from './entitlements';
export type {
  PortalEntitlementsApi,
  EntitlementDecision,
} from './entitlements';
