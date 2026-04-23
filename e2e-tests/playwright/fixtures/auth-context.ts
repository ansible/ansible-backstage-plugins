import { test as base, chromium, BrowserContext } from '@playwright/test';
import { loginAAP } from '../utils/auth';

// Shared context that persists across all tests in the worker
let sharedContext: BrowserContext | null = null;
let isAuthenticated = false;

/**
 * Custom fixture that provides a shared authenticated browser context
 * The context stays open for all tests, preserving the OAuth session
 */
export const test = base.extend<{ authenticatedContext: BrowserContext }>({
  // Worker-scoped fixture that creates and maintains the shared context
  authenticatedContext: [
    async ({ browser }, use) => {
      // Create context once per worker
      if (!sharedContext) {
        console.log('[Shared Context] Creating persistent browser context...');
        sharedContext = await browser.newContext({
          baseURL: process.env.BASE_URL || 'http://localhost:7071',
          ignoreHTTPSErrors: true,
          viewport: { width: 1920, height: 1080 },
        });

        // Login once with retry on failure
        console.log('[Shared Context] Performing one-time login...');
        const loginPage = await sharedContext.newPage();

        let loginSuccess = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!loginSuccess && attempts < maxAttempts) {
          attempts++;
          try {
            console.log(
              `[Shared Context] Login attempt ${attempts}/${maxAttempts}...`,
            );
            await loginAAP(loginPage);
            loginSuccess = true;
            console.log('[Shared Context] ✓ Login successful');
          } catch (error) {
            console.log(
              `[Shared Context] Login attempt ${attempts} failed:`,
              (error as Error).message,
            );
            if (attempts < maxAttempts) {
              console.log('[Shared Context] Retrying login...');
              await loginPage.goto('/'); // Reset to home page
              await loginPage.waitForTimeout(2000);
            } else {
              throw new Error(
                `Failed to login after ${maxAttempts} attempts: ${(error as Error).message}`,
              );
            }
          }
        }

        await loginPage.close();
        isAuthenticated = true;
        console.log(
          '[Shared Context] ✓ Session will be preserved across all tests',
        );
      }

      await use(sharedContext);
      // Don't close context - keep it alive for all tests
    },
    { scope: 'worker' },
  ],

  // Override page to use the authenticated context
  page: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
