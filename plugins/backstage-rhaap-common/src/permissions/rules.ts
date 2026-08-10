import {
  createPermissionResourceRef,
  createPermissionRule,
} from '@backstage/plugin-permission-node';
import { z } from 'zod/v3';
import {
  RESOURCE_TYPE_ANSIBLE_SETTINGS,
  type AnsibleSettingsCapability,
} from './index';

export type AnsibleSettingsResource = {
  capability: AnsibleSettingsCapability;
};

export type AnsibleSettingsFilter = { capability: { $eq: string } };

export type HasCapabilityParams = {
  capability: AnsibleSettingsCapability;
};

export const ansibleSettingsResourceRef = createPermissionResourceRef<
  AnsibleSettingsResource,
  AnsibleSettingsFilter
>().with({
  pluginId: 'catalog',
  resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
});

export const hasCapability = createPermissionRule<
  typeof ansibleSettingsResourceRef,
  HasCapabilityParams
>({
  name: 'FOR_CAPABILITY',
  description: 'Match settings mutations by capability area (apme)',
  resourceRef: ansibleSettingsResourceRef,
  paramsSchema: z.object({
    capability: z.enum(['apme']),
  }),
  apply: (resource, { capability }) => resource.capability === capability,
  toQuery: ({ capability }) => ({ capability: { $eq: capability } }),
});

export const settingsPermissionRules = [hasCapability];
