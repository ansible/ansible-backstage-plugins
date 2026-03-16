import {
  executionEnvironmentViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  ansiblePermissions,
} from './permissions';

describe('permissions', () => {
  it('exports executionEnvironmentViewPermission with correct shape', () => {
    expect(executionEnvironmentViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.execution-environment.view',
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

  it('ansiblePermissions contains all three permissions', () => {
    expect(ansiblePermissions).toHaveLength(3);
    expect(ansiblePermissions).toContain(executionEnvironmentViewPermission);
    expect(ansiblePermissions).toContain(gitRepositoriesViewPermission);
    expect(ansiblePermissions).toContain(collectionsViewPermission);
  });

  it('each permission has type basic and attributes object', () => {
    ansiblePermissions.forEach(permission => {
      expect(permission.type).toBe('basic');
      expect(permission.attributes).toEqual({});
      expect(typeof permission.name).toBe('string');
      expect(permission.name.length).toBeGreaterThan(0);
    });
  });
});
