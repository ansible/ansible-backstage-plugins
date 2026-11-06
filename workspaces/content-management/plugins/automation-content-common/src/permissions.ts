import type { BasicPermission } from '@backstage/plugin-permission-common';

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
