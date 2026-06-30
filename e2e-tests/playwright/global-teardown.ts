import { deleteNonAdminTestUser } from './utils/aap-user-setup';

async function globalTeardown() {
  if (
    process.env.CI &&
    process.env.AAP_NONADMIN_USER_ID &&
    process.env.AAP_TOKEN
  ) {
    await deleteNonAdminTestUser();
  }
}

export default globalTeardown;
