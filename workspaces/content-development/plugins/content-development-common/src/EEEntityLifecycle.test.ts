import { eeEntityLifecycleServiceRef } from './EEEntityLifecycle';

describe('EE lifecycle service reference', () => {
  it('keeps the lifecycle adapter plugin-scoped', () => {
    expect(eeEntityLifecycleServiceRef.id).toBe('ansible.ee-entity-lifecycle');
    expect(eeEntityLifecycleServiceRef.scope).toBe('plugin');
  });
});
