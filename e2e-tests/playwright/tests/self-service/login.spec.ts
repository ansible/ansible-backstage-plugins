import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth-context';

/**
 * Ansible self-service Authentication Tests
 * Migrated from Cypress cypress/e2e/self-service/login.cy.ts
 *
 * Key improvements over Cypress:
 * - Login once via shared browser context
 * - Browser stays open, preserving session across all tests
 * - No hard-coded cy.wait() calls
 * - Auto-retry assertions
 * - Cleaner async/await syntax
 * - Much faster - login happens once, not per test
 */

/** Matches the sign-in picker title in the shell (UI copy uses "sign-in"). */
function signInGateHeading(page: Page) {
  return page.getByRole('heading', { name: /select a sign-in method/i });
}

/** Past OAuth gate: no sign-in picker, no AAP username/password form, main shell visible. */
async function expectAuthenticatedCatalogShell(
  page: Page,
  options?: { gateTimeout?: number },
) {
  const timeout = options?.gateTimeout ?? 20000;
  await expect(signInGateHeading(page)).toBeHidden({ timeout });
  await expect(page.getByText('Log in to your account')).not.toBeVisible();
  await expect(page.locator('main')).toBeVisible();
}

test.describe('Ansible self-service Authentication Tests', () => {
  /** Shell may not show exact "Templates" on `/`; catalog/self-service routes reflect real post-login UX. */
  test('Verify user is authenticated', async ({ page }) => {
    await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });

    await expectAuthenticatedCatalogShell(page);
    await expect(page).toHaveURL(/\/self-service/);
  });

  test('Verify logged in user stays logged in across navigation', async ({
    page,
  }) => {
    await page.goto('/self-service', { waitUntil: 'domcontentloaded' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });

    await expectAuthenticatedCatalogShell(page);
    await expect(page).toHaveURL(/\/self-service/);
  });

  test('Verify main content loads for authenticated user', async ({ page }) => {
    // Prefer domcontentloaded over networkidle (SPAs often never go "idle").
    await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });

    await expectAuthenticatedCatalogShell(page, { gateTimeout: 20000 });
  });
});
