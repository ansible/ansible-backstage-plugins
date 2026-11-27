import type { BasicPermission } from '@backstage/plugin-permission-common';

export {
  executionEnvironmentsViewPermission,
  executionEnvironmentsBuildPermission,
} from '@ansible/portal-extension-common';

/** Allows manual reconciliation of automation content from configured sources. */
export const contentSyncPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.content.sync',
  attributes: { action: 'update' },
};
