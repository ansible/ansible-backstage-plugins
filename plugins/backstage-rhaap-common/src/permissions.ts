import type { BasicPermission } from '@backstage/plugin-permission-common';

export const executionEnvironmentViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environment.view',
  attributes: {},
};

export const executionEnvironmentCreatePermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environment.create',
  attributes: {},
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

export const ansiblePermissions = [
  executionEnvironmentViewPermission,
  executionEnvironmentCreatePermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
];
