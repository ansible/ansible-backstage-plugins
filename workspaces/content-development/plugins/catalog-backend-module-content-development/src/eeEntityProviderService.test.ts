import { EEEntityProviderServiceImpl } from './eeEntityProviderService';

describe('EEEntityProviderServiceImpl', () => {
  it('exposes the EE provider contract', () => {
    const service = new EEEntityProviderServiceImpl({} as any);
    expect(service.getProviderName()).toBe('EEEntityProvider');
  });

  it('requires and delegates to the initialized registration lock', async () => {
    const service = new EEEntityProviderServiceImpl({} as any);
    const operation = jest.fn().mockResolvedValue('serialized');

    await expect(
      service.withRegistrationLock('component:default/ee', operation),
    ).rejects.toThrow('EE registration lock has not been initialized');

    const lock = jest
      .fn()
      .mockImplementation((_ref, callback) =>
        callback({ registrationState: 'none' }),
      );
    service.initializeRegistrationLock(lock);

    await expect(
      service.withRegistrationLock('component:default/ee', operation),
    ).resolves.toBe('serialized');
    expect(lock).toHaveBeenCalledWith('component:default/ee', operation);
  });
});
