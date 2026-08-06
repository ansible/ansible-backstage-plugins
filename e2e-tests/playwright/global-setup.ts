import { createNonAdminTestUser } from './utils/aap-user-setup';
import { setupNonAdminRBAC } from './utils/rbac-setup';

/** Creates the non-admin AAP user, syncs the catalog, and creates an RBAC role via the UI wizard. */
async function globalSetup() {
  if (process.env.AAP_NONADMIN_USER_ID && process.env.AAP_TOKEN) {
    await createNonAdminTestUser();
    await setupNonAdminRBAC();
  }
}

export default globalSetup;
