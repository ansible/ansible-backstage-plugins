import {
  eeEntityLifecycleServiceRef,
  eeEntityProviderServiceRef,
} from './EEEntityLifecycle';

describe('EE lifecycle service references', () => {
  it('keeps the provider root-scoped and lifecycle adapter plugin-scoped', () => {
    expect(eeEntityProviderServiceRef.id).toBe('ansible.ee-entity-provider');
    expect(eeEntityProviderServiceRef.scope).toBe('root');
    expect(eeEntityLifecycleServiceRef.id).toBe('ansible.ee-entity-lifecycle');
    expect(eeEntityLifecycleServiceRef.scope).toBe('plugin');
  });
});
