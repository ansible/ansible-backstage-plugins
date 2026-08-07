import { createAuthContextFixture } from './create-auth-context';

export const test = createAuthContextFixture('Non-Admin Context', () => {
  const userId = process.env.AAP_NONADMIN_USER_ID;
  const password = process.env.AAP_NONADMIN_USER_PASS;
  if (!userId || !password) {
    throw new Error(
      'AAP_NONADMIN_USER_ID and AAP_NONADMIN_USER_PASS must be set for non-admin tests',
    );
  }
  return { userId, password };
});

export { expect } from '@playwright/test';
