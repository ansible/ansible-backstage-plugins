/**
 * @ansible/portal-extension-common
 *
 * Serialisable types shared between frontend and backend portal plugins.
 * No React, no DOM, no Node APIs — safe to import in any context.
 *
 * **What lives here:**
 * - `PluginManifest` and the full capability/entry-point/operation model
 * - `CapabilityLaunch` discriminated union (`SlotLaunch | WorkflowLaunch | OperationLaunch`)
 * - `CONTENT_TYPES`, `EXPERIENCE_IDS`, `EXTENSION_POINTS` constants and their ID types
 *
 * **What does NOT live here:**
 * - React contribution types (`TabContribution`, `CardContribution`, `ActionContribution`)
 *   → `@ansible/portal-extension-api`
 * - `ContributionRegistry` and hooks (`useExtensionTabs` etc.)
 *   → `@ansible/portal-extension-api`
 * - Backend middleware and audit helpers
 *   → `@ansible/portal-plugin-node`
 */

export type {
  CapabilityLaunchType,
  SlotLaunch,
  WorkflowLaunch,
  OperationLaunch,
  CapabilityLaunch,
} from './launch';

export type { OperationRequest, OperationResponse } from './operations';
export type { EntitlementDecision } from './entitlements';

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

export {
  CONTENT_TYPES,
  EXPERIENCE_IDS,
  EXTENSION_POINTS,
} from './extensionPoints';
export type {
  ContentTypeId,
  ExperienceId,
  ExtensionPointId,
} from './extensionPoints';
