import type { BasicPermission } from '@backstage/plugin-permission-common';

/** Permission to view Ansible execution environments. */
export const executionEnvironmentsViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environments.view',
  attributes: {},
};

/** Permission to start an execution-environment build. */
export const executionEnvironmentsBuildPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environments.build',
  attributes: { action: 'update' },
};

/** Shared permission contracts for the Ansible content catalog surfaces. */
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

/** Permission to view Ansible templates. */
export const templatesViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.templates.view',
  attributes: {},
};

/** Permission to view execution history. */
export const historyViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.history.view',
  attributes: {},
};

/** Stable wire error code returned when an SCM integration credential fails. */
export const SCM_INTEGRATION_AUTH_FAILED_CODE = 'INTEGRATION_AUTH_FAILED';
