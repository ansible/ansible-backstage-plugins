/**
 * Re-export shim — manifest types have moved to `@ansible/portal-extension-common`.
 *
 * Importing from `@ansible/portal-extension-api` continues to work unchanged.
 * Switch to `@ansible/portal-extension-common` directly when you need to share
 * types with a backend plugin that cannot depend on React.
 */
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
} from '@ansible/portal-extension-common';
