import {
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
  ansiblePermissions,
  ansibleSettingsEditPermission,
  ansibleSettingsViewPermission,
  RESOURCE_TYPE_ANSIBLE_SETTINGS,
} from './index';

describe('permissions', () => {
  it('exports executionEnvironmentsViewPermission with correct shape', () => {
    expect(executionEnvironmentsViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.execution-environments.view',
      attributes: {},
    });
  });

  it('exports gitRepositoriesViewPermission with correct shape', () => {
    expect(gitRepositoriesViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.git-repositories.view',
      attributes: {},
    });
  });

  it('exports collectionsViewPermission with correct shape', () => {
    expect(collectionsViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.collections.view',
      attributes: {},
    });
  });

  it('exports templatesViewPermission with correct shape', () => {
    expect(templatesViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.templates.view',
      attributes: {},
    });
  });

  it('exports historyViewPermission with correct shape', () => {
    expect(historyViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.history.view',
      attributes: {},
    });
  });

  it('exports ansibleSettingsEditPermission as a resource permission', () => {
    expect(ansibleSettingsEditPermission).toEqual({
      type: 'resource',
      name: 'ansible.settings.edit',
      resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
      attributes: {},
    });
  });

  it('exports ansibleSettingsViewPermission as a resource permission', () => {
    expect(ansibleSettingsViewPermission).toEqual({
      type: 'resource',
      name: 'ansible.settings.view',
      resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
      attributes: {},
    });
  });

  it('ansiblePermissions contains all five view permissions', () => {
    expect(ansiblePermissions).toHaveLength(5);
    expect(ansiblePermissions).toContain(executionEnvironmentsViewPermission);
    expect(ansiblePermissions).toContain(gitRepositoriesViewPermission);
    expect(ansiblePermissions).toContain(collectionsViewPermission);
    expect(ansiblePermissions).toContain(templatesViewPermission);
    expect(ansiblePermissions).toContain(historyViewPermission);
    expect(ansiblePermissions).not.toContain(ansibleSettingsEditPermission);
  });

  it('each view permission has type basic and attributes object', () => {
    ansiblePermissions.forEach(permission => {
      expect(permission.type).toBe('basic');
      expect(permission.attributes).toEqual({});
      expect(typeof permission.name).toBe('string');
      expect(permission.name.length).toBeGreaterThan(0);
    });
  });
});
