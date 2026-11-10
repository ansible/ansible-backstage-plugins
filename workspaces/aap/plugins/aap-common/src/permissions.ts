import type { BasicPermission } from '@backstage/plugin-permission-common';
import { executionEnvironmentsViewPermission } from '@ansible/automation-content-common/permissions';

/**
 * @deprecated Import from @ansible/automation-content-common/permissions instead.
 */
export { executionEnvironmentsViewPermission };

export const gitRepositoriesViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.git-repositories.view',
  attributes: {},
};

export const collectionsViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.collections.view',
  attributes: {},
};

export const templatesViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.templates.view',
  attributes: {},
};

export const historyViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.history.view',
  attributes: {},
};

export const ansiblePermissions = [
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
];
