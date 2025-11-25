import { Common } from '../utils/common';

describe('Ansible self-service Authentication Tests', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});
