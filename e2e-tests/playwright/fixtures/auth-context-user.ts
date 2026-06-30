import { test as base, BrowserContext } from '@playwright/test';
import { loginAAP } from '../utils/auth';

let sharedContext: BrowserContext | null = null;

/**
 * Fixture that provides a shared browser context authenticated as a non-admin AAP user.
 * Uses AAP_NONADMIN_USER_ID / AAP_NONADMIN_USER_PASS environment variables.
 */
export const test = base.extend<{ authenticatedContext: BrowserContext }>({
  authenticatedContext: [
    async ({ browser }, use) => {
      if (!sharedContext) {
        console.log(
          '[Non-Admin Context] Creating persistent browser context...',
        );
        sharedContext = await browser.newContext({
          baseURL: process.env.BASE_URL || 'http://localhost:7071',
          ignoreHTTPSErrors: true,
          viewport: { width: 1920, height: 1080 },
        });

        console.log('[Non-Admin Context] Performing one-time login...');
        const loginPage = await sharedContext.newPage();

        let loginSuccess = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!loginSuccess && attempts < maxAttempts) {
          attempts++;
          try {
            console.log(
              `[Non-Admin Context] Login attempt ${attempts}/${maxAttempts}...`,
            );
            await loginAAP(loginPage, {
              userId: process.env.AAP_NONADMIN_USER_ID!,
              password: process.env.AAP_NONADMIN_USER_PASS!,
            });
            loginSuccess = true;
            console.log('[Non-Admin Context] ✓ Login successful');
          } catch (error) {
            console.log(
              `[Non-Admin Context] Login attempt ${attempts} failed:`,
              (error as Error).message,
            );
            if (attempts < maxAttempts) {
              console.log('[Non-Admin Context] Retrying login...');
              await loginPage.goto('/');
              await loginPage.waitForTimeout(2000);
            } else {
              throw new Error(
                `Failed to login as non-admin after ${maxAttempts} attempts: ${
                  (error as Error).message
                }`,
              );
            }
          }
        }

        await loginPage.close();
        console.log(
          '[Non-Admin Context] ✓ Session will be preserved across all tests',
        );
      }

      await use(sharedContext);
    },
    { scope: 'worker' } as never,
  ],

  page: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
