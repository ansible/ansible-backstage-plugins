import {
  createPermission,
  type BasicPermission,
} from '@backstage/plugin-permission-common';

export const executionEnvironmentsViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.execution-environments.view',
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

/** Resource type for portal settings scoped by capability area. */
export const RESOURCE_TYPE_ANSIBLE_SETTINGS = 'ansible-settings';

/**
 * Resource permission to view portal settings for a capability area.
 * Authorize with `resourceRef` set to a registered capability id (e.g. `'apme'`).
 */
export const ansibleSettingsViewPermission = createPermission({
  name: 'ansible.settings.view',
  resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
  attributes: {},
});

/**
 * Resource permission to mutate portal settings for a capability area.
 * Authorize with `resourceRef` set to a registered capability id (e.g. `'apme'`).
 */
export const ansibleSettingsEditPermission = createPermission({
  name: 'ansible.settings.edit',
  resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
  attributes: {},
});

export const ansiblePermissions = [
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
];
