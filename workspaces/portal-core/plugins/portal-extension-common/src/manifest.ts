/**
 * Manifest-level types for the portal plugin contract.
 *
 * These types are serialisable — no React, no Node. They describe what a
 * plugin publishes and what the host validates before activating it.
 *
 * Source of truth: §6.3 of the Content Experience Architecture document.
 */

import type { Entity } from '@backstage/catalog-model';
import type {
  BasicPermission,
  ResourcePermission,
} from '@backstage/plugin-permission-common';
import type { CapabilityLaunch } from './launch';

// ── Shared primitives ─────────────────────────────────────────────────────────

/**
 * A Backstage permission gate for a capability or entry point.
 *
 * Supports both basic permissions (no resource type, e.g. `gitRepositoriesViewPermission`)
 * and resource-scoped permissions (e.g. `ansibleSettingsViewPermission` which
 * gates by `resourceRef: 'apme'`). When `permission` is a `ResourcePermission`,
 * supply `resourceRef` so the host can authorize against the correct resource instance.
 */
export type PermissionRequirement =
  | BasicPermission
  | {
      permission: ResourcePermission<string>;
      resourceRef: string;
    };

/**
 * An additional entity-level predicate, evaluated after `appliesToContentTypes`
 * passes. Throwing predicates are caught by the host and treated as "not
 * applicable" — they never crash the portal.
 *
 * Prefer `appliesToContentTypes` for type-based filtering; use `ContentPredicate`
 * only for entity-attribute conditions (e.g. "show only when the entity carries
 * annotation X").
 */
export type ContentPredicate = (entity: Entity) => boolean;

// ── Experience ────────────────────────────────────────────────────────────────

/**
 * A host-owned UX region. Plugins contribute capabilities *into* an experience;
 * they do not create experiences. An `experienceId` that does not match a known
 * `ExperienceDefinition` is rejected at registration.
 *
 * `portal-extension-host` declares the initial set:
 * - `'content-quality-assessment'`
 * - `'content-authoring'`
 * - `'content-migration'`
 */
export interface ExperienceDefinition {
  id: string;
  displayName: string;
  description: string;
  /** Named layout zones inside this experience that capabilities may target. */
  slots: string[];
}

// ── Entry point shape ─────────────────────────────────────────────────────────

/**
 * What kind of UI affordance an entry point provides.
 *
 * - `entity-tab` — a tab on a catalog entity detail page
 * - `entity-action` — an action in an entity's actions / kebab menu
 * - `catalog-item-action` — a button or action on a catalog list row or card
 * - `overview-slot` — a card in the entity overview section
 * - `page-tab` — a standalone full-page tab within an experience
 * - `table-column` — a column added to a catalog table view
 * - `menu-item` — a top-level or sidebar navigation item
 * - `overlay` — a panel or drawer overlaying the current page
 * - `settings-section` — a section within the portal settings page
 * - `route` — a standalone routable page inside the experience
 * - `scaffolder-field` — a custom scaffolder template form field
 * - `workflow` — a host-owned guided walkthrough or multi-step flow
 */
export type ContributionKind =
  | 'entity-tab'
  | 'entity-action'
  | 'catalog-item-action'
  | 'overview-slot'
  | 'page-tab'
  | 'table-column'
  | 'menu-item'
  | 'overlay'
  | 'settings-section'
  | 'route'
  | 'scaffolder-field'
  | 'workflow';

/**
 * Where in the portal layout an entry point appears.
 *
 * - `catalog-item` — a row or card on a catalog listing
 * - `entity-page` — a catalog entity detail page
 * - `definition` — an authored definition (e.g. `execution-environment.yml`)
 * - `experience-slot` — an always-on contribution inside the experience layout
 */
export type EntrySurface =
  | 'catalog-item'
  | 'entity-page'
  | 'definition'
  | 'experience-slot';

/**
 * A single affordance a capability offers on a specific surface.
 *
 * The capability-level `appliesToContentTypes` is the union of everything the
 * plugin can handle. An entry point narrows it: a quality capability that applies
 * to collections and playbook repositories can still put a "Scan" button only on
 * the collection catalog row.
 */
export interface CapabilityEntryPoint {
  id: string;
  kind: ContributionKind;
  surface: EntrySurface;
  /**
   * Content types this entry point applies to. Must be a subset of the
   * parent capability's `appliesToContentTypes`.
   */
  appliesToContentTypes: string[];
  /** Button or tab label shown to the user. */
  label: string;
  description?: string;
  /** Display order within the capability's entry points on this surface. Lower = first. */
  order?: number;
  /**
   * How this entry point connects to a UI workflow or server-side operation.
   * The host passes the current content subject as context. Plugins do not
   * supply a URL.
   */
  launches: CapabilityLaunch;
  /** Permission required to see and use this entry point. Omit for no gate. */
  requiredPermission?: PermissionRequirement;
}

// ── Capability ────────────────────────────────────────────────────────────────

/**
 * What a plugin contributes into an experience.
 *
 * A plugin can have multiple capabilities, each targeting a different experience
 * or content type. One capability can offer different affordances on different
 * content subjects via its `entryPoints`.
 *
 * `experienceId` must match an `ExperienceDefinition` the host has declared.
 * Unknown values are rejected at registration — not silently ignored.
 */
export interface CapabilityContribution {
  id: string;
  /** Plugin ID that owns this capability. Set automatically by the host on load. */
  ownerPlugin: string;
  /** Host-owned experience this capability contributes to. */
  experienceId: string;
  displayName: string;
  description: string;
  /**
   * Content types this capability can run against. Required for content-facing
   * capabilities. Use `'*'` only for non-content surfaces (e.g. a global settings
   * section or a sidebar navigation item).
   *
   * Use the canonical IDs from `CONTENT_TYPES`:
   * `'collection'`, `'execution-environment-definition'`,
   * `'execution-environment-image'`, `'playbook-repository'`.
   *
   * The host evaluates this before mount and before every operation dispatch.
   * Deep links to inapplicable capabilities hide, rather than render an empty
   * or erroring shell.
   */
  appliesToContentTypes: string[] | '*';
  entryPoints: CapabilityEntryPoint[];
  /**
   * Additional entity-level predicate, evaluated after `appliesToContentTypes`
   * passes. The host catches throwing predicates and treats them as "not
   * applicable". Optional — prefer `appliesToContentTypes` for type-level gates.
   */
  appliesTo?: ContentPredicate;
  /** Display order within the experience. Lower = higher precedence. */
  order?: number;
  /**
   * Minimum host contract `apiVersion` required to activate this capability.
   * The host rejects capabilities whose `minimumHostApiVersion` exceeds the
   * host's current `apiVersion`.
   */
  minimumHostApiVersion: string;
}

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * A plugin's settings form contribution. The host renders the JSON Schema
 * using its RJSF shell and custom widget registry. Get/save go through
 * registered operations — there is no `apiEndpoint` or `handlerPath`.
 */
export interface SettingsContribution {
  id: string;
  title: string;
  category: string;
  /** JSON Schema describing the settings form fields. */
  schema: Record<string, unknown>;
  /** RJSF `uiSchema` for layout and custom widget selection. */
  uiSchema?: Record<string, unknown>;
  /** Operation ID invoked to load the current settings values. */
  getOperationId: string;
  /** Operation ID invoked to persist updated settings values. */
  saveOperationId: string;
}

// ── Entitlements ──────────────────────────────────────────────────────────────

/**
 * A feature gate that the plugin declares and the host may enforce.
 *
 * Entitlements map onto Backstage permission names; they are not a second RBAC
 * system. `'organization'` scope means the entitlement is evaluated per-org;
 * `'global'` means it applies across all organizations.
 */
export interface EntitlementDefinition {
  id: string;
  displayName: string;
  description: string;
  scope: 'global' | 'organization';
  /** Backstage permission name this entitlement enforces. */
  permissionName: string;
}

// ── Operations ────────────────────────────────────────────────────────────────

/**
 * Descriptor for a registered server-side operation.
 *
 * Operations are the **only** way a plugin causes a server-side effect —
 * including MCP tool execution and settings persistence. The handler lives
 * on the plugin backend, reached through its plugin ID. The manifest has no
 * `apiEndpoint` or `handlerPath` (architecture §9.2).
 *
 * An operation with `exposure.mcp: true` is automatically surfaced as an MCP
 * tool — no separate tool declaration.
 *
 * **Stub:** The full descriptor (execution mode, idempotency, audit category)
 * will be completed as part of `portal-plugin-node` (Phase 5 of ANSTRAT-2497).
 * Fields marked optional here may become required in Phase 5.
 */
export interface OperationDescriptor {
  /** Shared resources do not acquire an AAP owner. Default requires a selected organization. */
  organizationScope?: 'organization' | 'shared';
  /** Entitlements checked by the server before invoking the handler. */
  requiredEntitlements?: readonly string[];
  /** Stable, unique operation ID. Convention: `'<pluginId>.<domain>.<verb>'`. */
  id: string;
  /** Semantic version of the operation contract. */
  version: string;
  description?: string;
  /** JSON Schema for the operation's input payload. */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema for the operation's output payload. */
  outputSchema?: Record<string, unknown>;
  /** Backstage permission required to invoke this operation. */
  permission?: PermissionRequirement;
  /**
   * Per-surface exposure flags. Absence of a flag means the surface is
   * not exposed for this operation.
   */
  exposure?: {
    /** Expose this operation as an MCP tool. Name derived from the operation `id`. */
    mcp?: boolean;
    /** Expose this operation as a REST endpoint under the plugin's router. */
    rest?: boolean;
  };
  /** Audit category recorded on every invocation. */
  auditCategory?: string;
  /** True if invoking with the same input twice has the same effect as once. */
  idempotent?: boolean;
}

// ── Plugin manifest ───────────────────────────────────────────────────────────

/**
 * The serialisable manifest every plugin publishes.
 *
 * `portal-extension-common` owns the schema; `portal-extension-host` validates
 * it before activating the plugin. An invalid or incompatible manifest fails
 * locally — it does not prevent the portal from starting.
 *
 * `apiVersion` is the host contract version the plugin was built against.
 * The host rejects plugins whose `apiVersion` is incompatible with a clear
 * console error. Pre-1.0.0: minor bumps may include breaking changes
 * (documented in changelog). Post-1.0.0: additive-only across minor versions.
 */
export interface PluginManifest {
  /** Unique plugin identifier. Convention: `'<team>-<domain>'`. */
  id: string;
  /** Plugin version (semver). */
  version: string;
  /** Host contract version this plugin was built against (semver). */
  apiVersion: string;
  capabilities: CapabilityContribution[];
  settings?: SettingsContribution;
  entitlements: EntitlementDefinition[];
  operations?: OperationDescriptor[];
}
