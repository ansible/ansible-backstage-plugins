import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Basic AAP permissions — re-exported from @ansible/aap-common.
 */
export {
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
  ansiblePermissions,
} from '@ansible/aap-common';

/** Resource type for portal settings mutations scoped by capability area. */
export const RESOURCE_TYPE_ANSIBLE_SETTINGS = 'ansible-settings';

/**
 * Capability areas that can be authorized for settings permissions.
 * Resource refs passed to authorize / RequirePermission use these values
 * (e.g. `resourceRef: 'apme'`).
 */
export const ANSIBLE_SETTINGS_CAPABILITIES = ['apme'] as const;
export type AnsibleSettingsCapability =
  (typeof ANSIBLE_SETTINGS_CAPABILITIES)[number];

/**
 * Resource permission to view portal settings for a capability area.
 * Authorize with `resourceRef` set to a value from
 * {@link ANSIBLE_SETTINGS_CAPABILITIES} (e.g. `'apme'`).
 */
export const ansibleSettingsViewPermission = createPermission({
  name: 'ansible.settings.view',
  resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
  attributes: {},
});

/**
 * Resource permission to mutate portal settings for a capability area.
 * Authorize with `resourceRef` set to a value from
 * {@link ANSIBLE_SETTINGS_CAPABILITIES} (e.g. `'apme'`).
 */
export const ansibleSettingsEditPermission = createPermission({
  name: 'ansible.settings.edit',
  resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
  attributes: {},
});
