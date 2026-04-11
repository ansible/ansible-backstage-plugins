import { test as setup, expect } from '@playwright/test';
import { loginAAP } from '../../utils/auth';

const authFile = 'playwright/.auth/user.json';

/**
 * Setup test that runs once before all tests
 * Logs in and saves the authenticated state to be reused by all tests
 */
setup('authenticate', async ({ page }) => {
  console.log('[Setup] Performing one-time login...');

  await loginAAP(page);

  // Verify we're actually logged in before saving state
  await expect(
    page.getByText('Templates', { exact: true }).first(),
  ).toBeVisible();
  console.log('[Setup] Login verified, Templates navigation visible');

  // Save authentication state
  await page.context().storageState({ path: authFile });
  console.log('[Setup] Authentication state saved to', authFile);
});
