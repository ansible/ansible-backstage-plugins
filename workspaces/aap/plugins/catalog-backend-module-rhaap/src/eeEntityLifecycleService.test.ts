import { EELifecycleService } from './eeEntityLifecycleService';

describe('EELifecycleService', () => {
  it('exposes the EE provider contract', () => {
    const service = new EELifecycleService({} as any);
    expect(service.getProviderName()).toBe('EEEntityProvider');
  });
});
