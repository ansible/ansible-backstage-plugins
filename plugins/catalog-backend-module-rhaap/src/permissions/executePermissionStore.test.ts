import { ExecutePermissionStore } from './executePermissionStore';

describe('ExecutePermissionStore', () => {
  let store;

  beforeEach(() => {
    store = new ExecutePermissionStore();
  });

  describe('update', () => {
    it('should populate store from template-to-users map', () => {
      const templateMap = new Map();
      templateMap.set('11', ['network-user', 'branch-user']);
      templateMap.set('28', ['portal-user']);

      store.update(templateMap);

      expect(store.size).toBe(3);
      expect(store.getTemplateIdsForUser('network-user')).toEqual(['11']);
      expect(store.getTemplateIdsForUser('portal-user')).toEqual(['28']);
      expect(store.getTemplateIdsForUser('branch-user')).toEqual(['11']);
    });

    it('should handle user with multiple templates', () => {
      const templateMap = new Map();
      templateMap.set('11', ['network-user']);
      templateMap.set('12', ['network-user']);
      templateMap.set('21', ['network-user']);

      store.update(templateMap);

      expect(store.size).toBe(1);
      const ids = store.getTemplateIdsForUser('network-user');
      expect(ids).toHaveLength(3);
      expect(ids).toContain('11');
      expect(ids).toContain('12');
      expect(ids).toContain('21');
    });

    it('should replace previous data on update', () => {
      const first = new Map();
      first.set('11', ['user-a']);
      store.update(first);
      expect(store.hasExecutePermission('user-a', '11')).toBe(true);

      const second = new Map();
      second.set('22', ['user-b']);
      store.update(second);
      expect(store.hasExecutePermission('user-a', '11')).toBe(false);
      expect(store.hasExecutePermission('user-b', '22')).toBe(true);
    });

    it('should handle empty map', () => {
      store.update(new Map());
      expect(store.size).toBe(0);
    });
  });

  describe('getTemplateIdsForUser', () => {
    it('should return empty array for unknown user', () => {
      expect(store.getTemplateIdsForUser('unknown')).toEqual([]);
    });
  });

  describe('hasExecutePermission', () => {
    beforeEach(() => {
      const templateMap = new Map();
      templateMap.set('11', ['network-user']);
      templateMap.set('28', ['portal-user']);
      store.update(templateMap);
    });

    it('should return true for user with permission', () => {
      expect(store.hasExecutePermission('network-user', '11')).toBe(true);
    });

    it('should return false for user without permission', () => {
      expect(store.hasExecutePermission('portal-user', '11')).toBe(false);
    });

    it('should return false for unknown user', () => {
      expect(store.hasExecutePermission('unknown', '11')).toBe(false);
    });

    it('should return false for unknown template', () => {
      expect(store.hasExecutePermission('network-user', '999')).toBe(false);
    });
  });
});
