import { EEEntityProviderServiceImpl } from './eeEntityProviderService';

describe('EEEntityProviderServiceImpl', () => {
  it('exposes the EE provider contract', () => {
    const service = new EEEntityProviderServiceImpl({} as any);
    expect(service.getProviderName()).toBe('EEEntityProvider');
  });
});
