import type { BasicPermission } from '@backstage/plugin-permission-common';

/** Existing EE read grant used by deployed RBAC policies. */
export const executionEnvironmentsViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environments.view',
  attributes: {},
};

/** Allows manual reconciliation of automation content from configured sources. */
export const contentSyncPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.content.sync',
  attributes: { action: 'update' },
};
