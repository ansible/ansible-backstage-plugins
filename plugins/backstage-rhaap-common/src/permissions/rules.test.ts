import {
  createSettingsPermissionRules,
  ansibleSettingsResourceRef,
  type AnsibleSettingsResource,
} from './rules';
import { RESOURCE_TYPE_ANSIBLE_SETTINGS } from './index';

describe('settings permission rules', () => {
  it('registers ansibleSettingsResourceRef for catalog plugin', () => {
    expect(ansibleSettingsResourceRef.pluginId).toBe('catalog');
    expect(ansibleSettingsResourceRef.resourceType).toBe(
      RESOURCE_TYPE_ANSIBLE_SETTINGS,
    );
  });

  describe('createSettingsPermissionRules', () => {
    const rules = createSettingsPermissionRules(['apme']);
    const hasCapability = rules[0];

    it('returns a single FOR_CAPABILITY rule', () => {
      expect(rules).toHaveLength(1);
      expect(hasCapability.name).toBe('FOR_CAPABILITY');
    });

    it('apply returns true when capability matches', () => {
      expect(
        hasCapability.apply({ capability: 'apme' }, { capability: 'apme' }),
      ).toBe(true);
    });

    it('apply returns false when capability does not match', () => {
      const otherResource = {
        capability: 'other',
      } as unknown as AnsibleSettingsResource;
      expect(hasCapability.apply(otherResource, { capability: 'apme' })).toBe(
        false,
      );
    });

    it('toQuery returns equality filter for capability', () => {
      expect(hasCapability.toQuery({ capability: 'apme' })).toEqual({
        capability: { $eq: 'apme' },
      });
    });

    it('supports multiple capability ids', () => {
      const multiRules = createSettingsPermissionRules(['apme', 'aap']);
      const rule = multiRules[0];
      expect(rule.apply({ capability: 'aap' }, { capability: 'aap' })).toBe(
        true,
      );
      expect(rule.apply({ capability: 'apme' }, { capability: 'aap' })).toBe(
        false,
      );
    });
  });
});
