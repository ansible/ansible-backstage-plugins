import {
  hasCapability,
  settingsPermissionRules,
  ansibleSettingsResourceRef,
} from './rules';
import { RESOURCE_TYPE_ANSIBLE_SETTINGS } from './index';

describe('settings permission rules', () => {
  it('registers ansibleSettingsResourceRef for catalog plugin', () => {
    expect(ansibleSettingsResourceRef.pluginId).toBe('catalog');
    expect(ansibleSettingsResourceRef.resourceType).toBe(
      RESOURCE_TYPE_ANSIBLE_SETTINGS,
    );
  });

  it('exports hasCapability as FOR_CAPABILITY', () => {
    expect(hasCapability.name).toBe('FOR_CAPABILITY');
    expect(settingsPermissionRules).toContain(hasCapability);
  });

  it('apply returns true when capability matches', () => {
    expect(
      hasCapability.apply({ capability: 'apme' }, { capability: 'apme' }),
    ).toBe(true);
  });

  it('apply returns false when capability does not match', () => {
    expect(
      hasCapability.apply({ capability: 'apme' }, { capability: 'aap' }),
    ).toBe(false);
  });

  it('toQuery returns equality filter for capability', () => {
    expect(hasCapability.toQuery({ capability: 'general' })).toEqual({
      capability: { $eq: 'general' },
    });
  });
});
