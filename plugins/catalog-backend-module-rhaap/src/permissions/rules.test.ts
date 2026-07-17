import { executePermissionStore } from './executePermissionStore';
import { hasExecutePermission as rule } from './rules';

describe('HAS_EXECUTE_PERMISSION rule', () => {
  beforeEach(() => {
    const templateMap = new Map();
    templateMap.set('11', ['network-user']);
    templateMap.set('28', ['portal-user']);
    executePermissionStore.update(templateMap);
  });

  describe('apply', () => {
    it('should return true when user has execute permission on template', () => {
      const entity = {
        metadata: { name: 'test', aapJobTemplateId: 11 },
        kind: 'Template',
        apiVersion: 'backstage.io/v1alpha1',
      };
      expect(
        rule.apply(entity, { userEntityRef: 'user:default/network-user' }),
      ).toBe(true);
    });

    it('should return false when user lacks execute permission', () => {
      const entity = {
        metadata: { name: 'test', aapJobTemplateId: 11 },
        kind: 'Template',
        apiVersion: 'backstage.io/v1alpha1',
      };
      expect(
        rule.apply(entity, { userEntityRef: 'user:default/portal-user' }),
      ).toBe(false);
    });

    it('should return true for entities without aapJobTemplateId', () => {
      const entity = {
        metadata: { name: 'custom-template' },
        kind: 'Template',
        apiVersion: 'backstage.io/v1alpha1',
      };
      expect(
        rule.apply(entity, { userEntityRef: 'user:default/portal-user' }),
      ).toBe(true);
    });

    it('should extract username from full entity ref', () => {
      const entity = {
        metadata: { name: 'test', aapJobTemplateId: 28 },
        kind: 'Template',
        apiVersion: 'backstage.io/v1alpha1',
      };
      expect(
        rule.apply(entity, { userEntityRef: 'user:default/portal-user' }),
      ).toBe(true);
    });

    it('should handle string aapJobTemplateId', () => {
      const entity = {
        metadata: { name: 'test', aapJobTemplateId: '11' },
        kind: 'Template',
        apiVersion: 'backstage.io/v1alpha1',
      };
      expect(
        rule.apply(entity, { userEntityRef: 'user:default/network-user' }),
      ).toBe(true);
    });
  });

  describe('toQuery', () => {
    it('should return template IDs for user with permissions', () => {
      const result = rule.toQuery({
        userEntityRef: 'user:default/network-user',
      });
      expect(result.key).toBe('metadata.aapJobTemplateId');
      expect(result.values).toEqual(['11']);
    });

    it('should return __none__ sentinel for user with no permissions', () => {
      const result = rule.toQuery({
        userEntityRef: 'user:default/unknown-user',
      });
      expect(result.key).toBe('metadata.aapJobTemplateId');
      expect(result.values).toEqual(['__none__']);
    });

    it('should return multiple template IDs', () => {
      const templateMap = new Map();
      templateMap.set('11', ['multi-user']);
      templateMap.set('12', ['multi-user']);
      templateMap.set('21', ['multi-user']);
      executePermissionStore.update(templateMap);

      const result = rule.toQuery({
        userEntityRef: 'user:default/multi-user',
      });
      expect(result.key).toBe('metadata.aapJobTemplateId');
      expect(result.values).toHaveLength(3);
      expect(result.values).toContain('11');
      expect(result.values).toContain('12');
      expect(result.values).toContain('21');
    });
  });
});
