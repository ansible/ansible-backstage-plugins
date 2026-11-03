import { UserProvisioner } from './index';

describe('UserProvisioner', () => {
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
