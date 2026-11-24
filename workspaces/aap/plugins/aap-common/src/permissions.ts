import {
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
} from '@ansible/portal-extension-common';

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

/** @deprecated Import from @ansible/portal-extension-common. */
export { collectionsViewPermission };

/** @deprecated Import from @ansible/portal-extension-common. */
export { templatesViewPermission };

/** @deprecated Import from @ansible/portal-extension-common. */
export { historyViewPermission };

export const ansiblePermissions = [
  executionEnvironmentsBuildPermission,
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
];
