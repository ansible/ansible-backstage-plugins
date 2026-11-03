import { UserProvisioner } from './index';

describe('UserProvisioner shim', () => {
  it('re-exports UserProvisioner from @ansible/aap-node', async () => {
    const provisioner = new UserProvisioner();
    await expect(provisioner.createUser('jdoe', 42)).rejects.toThrow(
      'UserProvisioner: no create user function registered for "jdoe"',
    );
  });
});
