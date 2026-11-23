import type { BasicPermission } from '@backstage/plugin-permission-common';

export const gitRepositoriesViewPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.git-repositories.view',
  attributes: {},
};
