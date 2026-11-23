import { gitRepositoriesViewPermission } from '@ansible/portal-extension-common';
import type { BasicPermission } from '@backstage/plugin-permission-common';

import {
  executionEnvironmentsViewPermission,
  executionEnvironmentsBuildPermission,
} from '@ansible/automation-content-common/permissions';

/** @deprecated Import from @ansible/automation-content-common/permissions. */
export {
  executionEnvironmentsViewPermission,
  executionEnvironmentsBuildPermission,
};

/** @deprecated Import from @ansible/portal-extension-common. */
export { gitRepositoriesViewPermission };

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
  executionEnvironmentsBuildPermission,
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
];
