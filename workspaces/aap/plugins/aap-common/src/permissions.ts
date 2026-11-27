import {
  executionEnvironmentsViewPermission,
  executionEnvironmentsBuildPermission,
  collectionsViewPermission,
  gitRepositoriesViewPermission,
  templatesViewPermission,
  historyViewPermission,
} from '@ansible/portal-extension-common';

export {
  executionEnvironmentsViewPermission,
  executionEnvironmentsBuildPermission,
  collectionsViewPermission,
  gitRepositoriesViewPermission,
  templatesViewPermission,
  historyViewPermission,
};

export const ansiblePermissions = [
  executionEnvironmentsBuildPermission,
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
];
