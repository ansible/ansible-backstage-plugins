import type { LazyExoticComponent, ComponentType } from 'react';
import type { Entity } from '@backstage/catalog-model';
import type { ApiRef } from '@backstage/core-plugin-api';
import type { BasicPermission } from '@backstage/plugin-permission-common';
import type { ContentTypeId } from '@ansible/portal-extension-common';

// ── Launch types (re-exported from portal-extension-common) ───────────────────
// Kept here for backward compatibility. New code should import from
// @ansible/portal-extension-common directly when React is not needed.
export type {
  CapabilityLaunchType,
  SlotLaunch,
  WorkflowLaunch,
  OperationLaunch,
  CapabilityLaunch,
} from '@ansible/portal-extension-common';

// ── React contribution types ───────────────────────────────────────────────────

/** A React component that may be lazy-loaded or synchronous.
 *  `ExtensionRenderer` always wraps in `<Suspense>` — the fallback
 *  never activates for synchronous components. */
export type ContributionComponent =
  | LazyExoticComponent<ComponentType<any>>
  | ComponentType<any>;

/**
 * Context passed to an action's `onActivate` callback at invocation time.
 *
 * **`onActivate` is for pure UI effects only** — navigation, opening a dialog,
 * toggling a state flag. For any server-side effect use `launches` with
 * `type: 'operation'` or `type: 'workflow'` instead.
 */
export interface ActionContext {
  entity: Entity;
  /**
   * The canonical content type of the entity the action is acting on.
   * The host passes this at activation time — plugins must not derive it
   * themselves. Use `CONTENT_TYPES` constants to compare.
   */
  contentType?: ContentTypeId;
  /**
   * Resolves a Backstage API by ref. Equivalent to `useApi()` but callable
   * outside a React component. Built by `ExtensionRenderer` via
   * `useApiHolder()` at render time.
   */
  getApi: <T>(apiRef: ApiRef<T>) => T;
}

export interface TabContribution {
  id: string;
  label: string;
  icon?: ComponentType<{ fontSize?: 'small' | 'default' | 'large' }>;
  component: ContributionComponent;
  /**
   * Content type IDs this tab applies to. The host evaluates this statically
   * before mounting — it is the primary visibility gate.
   *
   * Use the canonical IDs from `CONTENT_TYPES`:
   * `'collection'`, `'execution-environment-definition'`,
   * `'execution-environment-image'`, `'playbook-repository'`.
   *
   * Omit (or use `'*'`) to apply to every content type on this extension point.
   */
  appliesToContentTypes?: string[] | '*';
  /**
   * Additional entity-level visibility predicate. Evaluated only after
   * `appliesToContentTypes` passes. Called inside a `try/catch` — a throwing
   * filter is treated as "don't show" and logs a warning.
   */
  filter?: (entity: Entity) => boolean;
  /** Permission gate evaluated by `ExtensionRenderer`. */
  permission?: BasicPermission;
  /**
   * Sort order within the tab strip. Lower = further left.
   * Built-in tabs use 0–20; community tabs should use 21+ to appear after
   * built-ins. Negative values are allowed. Equal priorities are ordered by
   * insertion order (stable sort).
   */
  priority?: number;
}

export interface CardContribution {
  id: string;
  slot: string;
  component: ContributionComponent;
  /** Content type IDs this card applies to. See `TabContribution.appliesToContentTypes`. */
  appliesToContentTypes?: string[] | '*';
  filter?: (entity: Entity) => boolean;
  permission?: BasicPermission;
  priority?: number;
}

export interface ActionContribution {
  /** Host-owned confirmation; server effects still run through launches. */
  confirmation?: { title: string; message: string; confirmLabel?: string };
  id: string;
  label: string;
  icon?: ComponentType;
  /**
   * React Router path for link-style actions (e.g. navigating to a
   * scaffolder template). When provided the host renders the action as a
   * `LinkButton`; `onActivate` is not called.
   */
  to?: string;
  /**
   * Pure-UI activation callback — navigation, opening a dialog, toggling a
   * state flag. **Must not make server calls or trigger server-side effects.**
   *
   * May be omitted when `to` is provided.
   */
  onActivate?: (context: ActionContext) => void | Promise<void>;
  /**
   * How this action connects to a server-side workflow or operation.
   * Provide this alongside (or instead of) `onActivate` when the action
   * causes a server-side effect.
   */
  launches?: import('@ansible/portal-extension-common').CapabilityLaunch;
  /** Content type IDs this action applies to. See `TabContribution.appliesToContentTypes`. */
  appliesToContentTypes?: string[] | '*';
  filter?: (entity: Entity) => boolean;
  permission?: BasicPermission;
  variant?: 'button' | 'menu-item';
  priority?: number;
}
