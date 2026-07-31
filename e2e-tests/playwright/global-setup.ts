import { createNonAdminTestUser } from './utils/aap-user-setup';
import { setupNonAdminRBAC } from './utils/rbac-setup';

/** Creates the non-admin AAP user, syncs the catalog, and creates an RBAC role via the UI wizard. */
async function globalSetup() {
  if (process.env.AAP_NONADMIN_USER_ID && process.env.AAP_TOKEN) {
    try {
      await createNonAdminTestUser();
      await setupNonAdminRBAC();
    } catch (error) {
      console.log(
        '[Global Setup] Non-admin setup failed:',
        (error as Error).message,
      );
    }
  }
}

export default globalSetup;
