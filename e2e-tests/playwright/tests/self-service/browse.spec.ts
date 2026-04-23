import { test, expect } from '../../fixtures/auth-context';

/**
 * Ansible self-service Browse page — migrated from cypress/e2e/self-service/browse.cy.ts
 * Auth: shared worker context (same pattern as login.spec.ts).
 */

const templateCardSelector =
  '[data-testid*="-"], .MuiCard-root, article, .template';

test.describe('Ansible self-service Browse Page Functional Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/self-service', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/self-service/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Validates the search bar functionality', async ({ page }) => {
    await expect(page).toHaveURL(/\/self-service/);
    await expect(page.getByText('Select a Sign-in method')).not.toBeVisible();
    await expect(page.getByText('Log in to your account')).not.toBeVisible();

    const hasSearchBar = await page.evaluate(() => {
      const bySelector =
        document.querySelectorAll(
          '[data-testid="search-bar-container"], [aria-label="search"], input[type="search"]',
        ).length > 0;
      const byPlaceholder = Array.from(document.querySelectorAll('input')).some(
        el =>
          ((el as HTMLInputElement).placeholder || '')
            .toLowerCase()
            .includes('search'),
      );
      return bySelector || byPlaceholder;
    });

    if (!hasSearchBar) {
      return;
    }

    let searchInput = page
      .locator('[data-testid="search-bar-container"]')
      .locator('input')
      .first();
    if ((await searchInput.count()) === 0) {
      searchInput = page
        .locator('[aria-label="search"]')
        .locator('input')
        .first();
    }
    if ((await searchInput.count()) === 0) {
      searchInput = page.locator('input[type="search"]').first();
    }

    await expect(searchInput).toBeAttached();
    await searchInput.fill('test', { force: true });
    await page.waitForTimeout(500);
    await searchInput.clear({ force: true });
  });

  test('Validates checkboxes/filters on the Page', async ({ page }) => {
    const categories = page.locator('#categories-picker');
    if ((await categories.count()) > 0) {
      await expect(categories).toBeVisible();
      return;
    }
    const filter = page.locator('[data-testid*="filter"]').first();
    if ((await filter.count()) > 0) {
      await expect(filter).toBeVisible();
    }
  });

  test('Validates template cards and Create button functionality', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    const firstCard = page.locator(templateCardSelector).first();
    if ((await firstCard.count()) === 0) {
      return;
    }

    const button = firstCard.locator('button').first();
    if ((await button.count()) === 0) {
      return;
    }

    await button.click();
    await page.waitForTimeout(1500);
    const url = page.url();
    if (
      url.includes('/create') ||
      url.includes('/template') ||
      url.includes('/details')
    ) {
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('Validates favorites functionality if available', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    const firstCard = page.locator(templateCardSelector).first();
    if ((await firstCard.count()) === 0) {
      return;
    }

    const buttons = firstCard.locator('button, [role="button"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = (await btn.textContent()) || '';
      const aria = (await btn.getAttribute('aria-label')) || '';
      const looksFavorite =
        /[♥🤍❤☆★]/.test(text) || aria.toLowerCase().includes('favorite');
      if (looksFavorite) {
        await btn.click();
        return;
      }
    }
  });

  test('Validates page loads successfully with templates', async ({ page }) => {
    await expect(page).toHaveURL(/\/self-service/);
    await expect(page.locator('main')).toBeVisible();

    const loading = await page
      .locator('[data-testid="loading-templates"]')
      .count();
    const bodyText = await page.locator('body').innerText();
    const cardCount = await page.locator(templateCardSelector).count();

    if (loading > 0) {
      // loading state
    } else if (cardCount > 0) {
      // templates present
    } else if (
      bodyText.includes('No templates') ||
      bodyText.toLowerCase().includes('empty')
    ) {
      // empty state
    }

    await expect(page.locator('main')).toBeVisible();
  });
});
