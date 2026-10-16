/**
 * Discriminated union describing how a capability entry point connects to
 * UI or a server-side effect.
 *
 * - `'slot'` — mounts a federated module (`moduleName`) into a named layout
 *   zone (`targetSlot`) inside the experience. Pure React — no network call
 *   at registration time.
 * - `'workflow'` — starts a host-owned guided walkthrough (`workflowId`).
 *   The host routes to it; the plugin does not provide a URL.
 * - `'operation'` — invokes a registered server-side operation (`operationId`).
 *   The operation handler lives on the plugin backend, behind permission,
 *   audit, and identity pipeline. Use this for any server-side effect.
 *
 * **Security invariant:** Plugins must not pass `apiEndpoint` or a fetch URL
 * for server effects. Every server call goes through an `operationId`.
 */
export type CapabilityLaunchType = 'slot' | 'workflow' | 'operation';

/** Mounts a federated module into a named layout zone inside the experience. */
export interface SlotLaunch {
  type: 'slot';
  /**
   * Federated module name resolved by the host in RHDH deployments.
   * Optional during Phase 4 while full slot-based activation is deferred.
   */
  moduleName?: string;
  /** Named layout zone inside the experience (e.g. `'content-authoring.overview'`). */
  targetSlot: string;
}

/** Starts a host-owned guided walkthrough. The plugin does not provide a URL. */
export interface WorkflowLaunch {
  type: 'workflow';
  /** ID of a host-owned guided walkthrough. */
  workflowId: string;
}

/**
 * Invokes a registered server-side operation.
 *
 * The handler lives on the plugin backend, behind permission, audit, and
 * identity pipeline. Use this for any server-side effect.
 *
 * **`followOn`** enables the "trigger work → show results" pattern:
 * e.g. a "Scan" button dispatches an operation, then opens the
 * quality-assessment slot to display the results tab.
 */
export interface OperationLaunch {
  type: 'operation';
  /** ID of a registered server-side operation. */
  operationId: string;
  /**
   * Optional follow-on after the operation is dispatched.
   * Opens a slot or starts a workflow to show the results.
   *
   * @example
   * launches: {
   *   type: 'operation',
   *   operationId: 'apme.scan.collection',
   *   followOn: { type: 'slot', targetSlot: 'content-quality-assessment.results' },
   * }
   */
  followOn?: SlotLaunch | WorkflowLaunch;
}

export type CapabilityLaunch = SlotLaunch | WorkflowLaunch | OperationLaunch;
