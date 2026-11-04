import type { BasicPermission } from '@backstage/plugin-permission-common';

/**
 * View execution environments surfaced by the automation-content plugin.
 * Moved from @ansible/aap-common (2026-11-10 workspace-alignment decision).
 * The name string is load-bearing: deployed RBAC rules reference it.
 */
export const executionEnvironmentsViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environments.view',
  attributes: {},
};

/** View automation content (execution environments, collections, documentation). */
export const automationContentViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.content.view',
  attributes: {},
};

/** Manually reconcile automation content from configured registries. */
export const automationContentSyncPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.content.sync',
  attributes: { action: 'update' },
};
