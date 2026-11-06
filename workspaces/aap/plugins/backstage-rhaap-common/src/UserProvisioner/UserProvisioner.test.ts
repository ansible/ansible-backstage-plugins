import {
  UserProvisioner as AapUserProvisioner,
  userProvisionerRef as aapUserProvisionerRef,
} from '@ansible/aap-node';
import { UserProvisioner, userProvisionerRef } from './index';

describe('UserProvisioner shim', () => {
  it('re-exports the same class and root-scoped service reference', () => {
    expect(UserProvisioner).toBe(AapUserProvisioner);
    expect(userProvisionerRef).toBe(aapUserProvisionerRef);
    expect(userProvisionerRef.id).toBe('rhaap.user-provisioner');
    expect(userProvisionerRef.scope).toBe('root');
  });

  it('re-exports UserProvisioner from @ansible/aap-node', async () => {
    const provisioner = new UserProvisioner();
    await expect(provisioner.createUser('jdoe', 42)).rejects.toThrow(
      'UserProvisioner: no create user function registered for "jdoe"',
    );
  });
});
