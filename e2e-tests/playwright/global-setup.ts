import { createNonAdminTestUser } from './utils/aap-user-setup';

async function globalSetup() {
  if (process.env.AAP_NONADMIN_USER_ID && process.env.AAP_TOKEN) {
    try {
      await createNonAdminTestUser();
    } catch (error) {
      console.log(
        '[Global Setup] Non-admin user creation failed:',
        (error as Error).message,
      );
    }
  }
}

export default globalSetup;
