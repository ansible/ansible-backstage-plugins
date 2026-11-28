import {
  ansibleSettingsViewPermission,
  ansibleSettingsEditPermission,
  ANSIBLE_SETTINGS_CAPABILITIES,
  RESOURCE_TYPE_ANSIBLE_SETTINGS,
} from './permissions';

it('preserves the existing settings permission IDs, shapes and capability refs', () => {
  expect(RESOURCE_TYPE_ANSIBLE_SETTINGS).toBe('ansible-settings');
  expect(ANSIBLE_SETTINGS_CAPABILITIES).toEqual(['apme']);
  expect(ansibleSettingsViewPermission).toEqual({
    type: 'resource',
    name: 'ansible.settings.view',
    resourceType: 'ansible-settings',
    attributes: {},
  });
  expect(ansibleSettingsEditPermission).toEqual({
    type: 'resource',
    name: 'ansible.settings.edit',
    resourceType: 'ansible-settings',
    attributes: {},
  });
});
