import { test as base, BrowserContext } from '@playwright/test';
import { loginAAP, AAPCredentials } from '../utils/auth';

type CredentialProvider = () => AAPCredentials | undefined;

/**
 * Factory that creates a Playwright fixture with a shared, worker-scoped
 * browser context authenticated against AAP. Both admin and non-admin
 * fixtures derive from this to keep retry / session logic in one place.
 */
export function createAuthContextFixture(
  label: string,
  getCredentials: CredentialProvider,
) {
  let sharedContext: BrowserContext | null = null;

  return base.extend<{ authenticatedContext: BrowserContext }>({
    authenticatedContext: [
      async ({ browser }, use) => {
        if (!sharedContext) {
          console.log(`[${label}] Creating persistent browser context...`);
          sharedContext = await browser.newContext({
            baseURL: process.env.BASE_URL || 'http://localhost:7071',
            ignoreHTTPSErrors: true,
            viewport: { width: 1920, height: 1080 },
          });

          console.log(`[${label}] Performing one-time login...`);
          const loginPage = await sharedContext.newPage();

          let loginSuccess = false;
          let attempts = 0;
          const maxAttempts = 3;

          while (!loginSuccess && attempts < maxAttempts) {
            attempts++;
            try {
              console.log(
                `[${label}] Login attempt ${attempts}/${maxAttempts}...`,
              );
              await loginAAP(loginPage, getCredentials());
              loginSuccess = true;
              console.log(`[${label}] Login successful`);
            } catch (error) {
              console.log(
                `[${label}] Login attempt ${attempts} failed:`,
                (error as Error).message,
              );
              if (attempts < maxAttempts) {
                console.log(`[${label}] Retrying login...`);
                await loginPage.goto('/');
                await loginPage.waitForTimeout(2000);
              } else {
                throw new Error(
                  `Failed to login (${label}) after ${maxAttempts} attempts: ${
                    (error as Error).message
                  }`,
                );
              }
            }
          }

          await loginPage.close();
          console.log(`[${label}] Session will be preserved across all tests`);
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
}
