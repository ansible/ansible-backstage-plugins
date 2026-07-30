import { chromium, FullConfig } from '@playwright/test';
import { loginAAP } from './utils/auth';
import { setupNonAdminRBAC } from './utils/rbac-setup';

/**
 * Global setup: authenticates as admin and saves session state.
 * When AAP_NONADMIN_USER_ID is set, also triggers catalog sync
 * and creates an RBAC role for the non-admin user via the UI wizard.
 */
async function globalSetup(config: FullConfig) {
  const { baseURL, ignoreHTTPSErrors, viewport } = config.projects[0].use;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors,
    viewport,
  });
  const page = await context.newPage();

  console.log('[Global Setup] Logging in to save authentication state...');
  await loginAAP(page);

  const storageStatePath = 'playwright/.auth/user.json';
  await context.storageState({ path: storageStatePath });
  console.log('[Global Setup] Authentication state saved to', storageStatePath);

  if (process.env.AAP_NONADMIN_USER_ID) {
    await setupNonAdminRBAC(page);
  }

  await browser.close();
}

export default globalSetup;
