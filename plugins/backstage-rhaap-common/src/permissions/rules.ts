import {
  createPermissionResourceRef,
  createPermissionRule,
} from '@backstage/plugin-permission-node';
import { z } from 'zod/v3';
import { RESOURCE_TYPE_ANSIBLE_SETTINGS } from './index';

export type AnsibleSettingsResource = {
  capability: string;
};

export type AnsibleSettingsFilter = { capability: { $eq: string } };

export type HasCapabilityParams = {
  capability: string;
};

export const ansibleSettingsResourceRef = createPermissionResourceRef<
  AnsibleSettingsResource,
  AnsibleSettingsFilter
>().with({
  pluginId: 'catalog',
  resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
});

/**
 * Build the `FOR_CAPABILITY` permission rule dynamically from the registered
 * capability IDs. The `paramsSchema` enum is derived from the actual set of
 * capabilities that registered at backend boot time.
 */
export function createSettingsPermissionRules(
  capabilityIds: readonly string[],
) {
  const hasCapability = createPermissionRule<
    typeof ansibleSettingsResourceRef,
    HasCapabilityParams
  >({
    name: 'FOR_CAPABILITY',
    description: 'Match settings access by capability area',
    resourceRef: ansibleSettingsResourceRef,
    paramsSchema: z.object({
      capability: z.enum(capabilityIds as [string, ...string[]]),
    }),
    apply: (resource, { capability }) => resource.capability === capability,
    toQuery: ({ capability }) => ({ capability: { $eq: capability } }),
  });
  return [hasCapability];
}
