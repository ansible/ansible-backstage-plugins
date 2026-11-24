import {
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';
import { ServiceFactoryTester } from '@backstage/backend-test-utils';
import { UserProvisioner, userProvisionerRef } from './index';

describe('UserProvisioner', () => {
  it('shares the default provisioner between catalog and auth consumers', async () => {
    const consumerRef = createServiceRef<{
      provisioner: typeof userProvisionerRef.T;
    }>({ id: 'test.user-provisioner-consumer' });
    const tester = ServiceFactoryTester.from(
      createServiceFactory({
        service: consumerRef,
        deps: { provisioner: userProvisionerRef },
        factory: ({ provisioner }) => ({ provisioner }),
      }),
    );

    const catalog = await tester.getSubject('catalog');
    const auth = await tester.getSubject('auth');

    expect(auth).not.toBe(catalog);
    expect(auth.provisioner).toBe(catalog.provisioner);
    expect(catalog.provisioner).toBeInstanceOf(UserProvisioner);
    await expect(auth.provisioner.createUser('jdoe', 42)).rejects.toThrow(
      'UserProvisioner: no create user function registered for "jdoe"',
    );

    const createUser = jest.fn().mockResolvedValue(true);
    (catalog.provisioner as UserProvisioner).registerCreateUserFn(createUser);

    await expect(auth.provisioner.createUser('jdoe', 42)).resolves.toBe(true);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith('jdoe', 42);
  });

  describe('createUser', () => {
    it('throws when no create function has been registered', async () => {
      const provisioner = new UserProvisioner();
      await expect(provisioner.createUser('jdoe', 42)).rejects.toThrow(
        'UserProvisioner: no create user function registered for "jdoe"',
      );
    });

    it('calls the registered function with username and userID', async () => {
      const provisioner = new UserProvisioner();
      const mockFn = jest.fn().mockResolvedValue(true);

      provisioner.registerCreateUserFn(mockFn);
      const result = await provisioner.createUser('jdoe', 42);

      expect(mockFn).toHaveBeenCalledWith('jdoe', 42);
      expect(result).toBe(true);
    });

    it('propagates errors thrown by the registered function', async () => {
      const provisioner = new UserProvisioner();
      provisioner.registerCreateUserFn(async () => {
        throw new Error('provisioning failed');
      });

      await expect(provisioner.createUser('jdoe', 42)).rejects.toThrow(
        'provisioning failed',
      );
    });

    it('allows replacing the registered function', async () => {
      const provisioner = new UserProvisioner();
      const firstFn = jest.fn().mockResolvedValue(false);
      const secondFn = jest.fn().mockResolvedValue(true);

      provisioner.registerCreateUserFn(firstFn);
      provisioner.registerCreateUserFn(secondFn);
      const result = await provisioner.createUser('jdoe', 42);

      expect(firstFn).not.toHaveBeenCalled();
      expect(secondFn).toHaveBeenCalledWith('jdoe', 42);
      expect(result).toBe(true);
    });
  });
});
