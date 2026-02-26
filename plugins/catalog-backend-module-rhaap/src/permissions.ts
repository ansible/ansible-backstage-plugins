import type { BasicPermission } from '@backstage/plugin-permission-common';

export const eeBuilderReadPermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.ee-builder.read',
  attributes: {
    action: 'read',
  },
};

export const eeBuilderCreatePermission: BasicPermission = {
  type: 'basic',
  name: 'ansible.ee-builder.create',
  attributes: {
    action: 'read',
  },
};

export const ansiblePermissions = [eeBuilderReadPermission];
