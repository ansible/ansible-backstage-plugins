import { chromium, FullConfig } from '@playwright/test';
import { loginAAP } from './utils/auth';

/**
 * Global setup to login once and save authentication state
 * This runs before all tests and saves the session to playwright/.auth/user.json
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

  // Login using our auth utility
  await loginAAP(page);

  // Save authentication state
  const storageStatePath = 'playwright/.auth/user.json';
  await context.storageState({ path: storageStatePath });

  console.log('[Global Setup] Authentication state saved to', storageStatePath);

  await browser.close();
}

export default globalSetup;
