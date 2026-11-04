import type { BasicPermission } from '@backstage/plugin-permission-common';

/** View automation content (execution environments, collections, documentation). */
export const automationContentViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.content.view',
  attributes: {},
};
