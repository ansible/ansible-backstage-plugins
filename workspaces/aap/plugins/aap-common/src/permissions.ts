import type { BasicPermission } from '@backstage/plugin-permission-common';

import {
  executionEnvironmentsViewPermission,
  executionEnvironmentsBuildPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
} from '@ansible/automation-content-common/permissions';

/** @deprecated Import from @ansible/automation-content-common/permissions. */
export {
  executionEnvironmentsViewPermission,
  executionEnvironmentsBuildPermission,
};

/** @deprecated Import content permissions from @ansible/automation-content-common/permissions. */
export { gitRepositoriesViewPermission, collectionsViewPermission };

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
  executionEnvironmentsBuildPermission,
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
];
