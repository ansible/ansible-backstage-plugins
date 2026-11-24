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

/** Allows dispatching an execution-environment image build. */
export const executionEnvironmentsBuildPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environments.build',
  attributes: { action: 'update' },
};

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
