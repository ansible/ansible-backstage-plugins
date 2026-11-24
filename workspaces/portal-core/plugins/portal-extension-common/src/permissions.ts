import type { BasicPermission } from '@backstage/plugin-permission-common';

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
