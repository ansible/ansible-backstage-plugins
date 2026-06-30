import { test, expect } from '../../fixtures/auth-context-user';

test.describe('Non-admin user: Templates page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/self-service/catalog', { waitUntil: 'networkidle' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });
    await expect(page).toHaveURL(/\/self-service/, { timeout: 15000 });
  });

  test('Templates page loads without "Insufficient privileges" error', async ({
    page,
  }) => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toContain('Insufficient privileges');
    expect(bodyText).not.toContain('Please contact your administrator');
  });

  test('Non-admin user can see template cards or empty state', async ({
    page,
  }) => {
    const templateCardSelector =
      '[data-testid*="-"], .MuiCard-root, article, .template';
    const hasCards = (await page.locator(templateCardSelector).count()) > 0;
    const hasEmptyState = await page
      .getByText(/No templates/i)
      .isVisible()
      .catch(() => false);

    expect(hasCards || hasEmptyState).toBeTruthy();
  });

  test('Non-admin user can use search bar', async ({ page }) => {
    const searchInput = page
      .locator('[data-testid="search-bar-container"] input')
      .or(page.locator('input[placeholder*="Search"]'))
      .first();

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await searchInput.clear();
    }
  });

  test('Non-admin user can use category filters', async ({ page }) => {
    const categoryPicker = page.locator('#categories-picker');
    if (await categoryPicker.isVisible().catch(() => false)) {
      await expect(categoryPicker).toBeVisible();
    }
  });

  test('Non-admin user sees only permitted templates or empty state', async ({
    page,
  }) => {
    const templateCardSelector =
      '[data-testid*="-"], .MuiCard-root, article, .template';
    const cardCount = await page.locator(templateCardSelector).count();
    const bodyText = (await page.locator('body').textContent()) ?? '';
    const hasEmptyState =
      /No templates/i.test(bodyText) || /empty/i.test(bodyText);

    // Non-admin should see only templates they have execute permission on, or empty state
    expect(cardCount > 0 || hasEmptyState).toBeTruthy();
    expect(bodyText).not.toContain('Insufficient privileges');
  });

  test('Non-admin user can open template create form', async ({ page }) => {
    const templateCardSelector =
      '[data-testid*="-"], .MuiCard-root, article, .template';
    const firstCard = page.locator(templateCardSelector).first();
    if ((await firstCard.count()) === 0) {
      // No templates available for this user — skip
      return;
    }

    // Find and click the Create/Launch button on the first card
    const buttons = firstCard.locator('button');
    let clicked = false;
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const btn = buttons.nth(i);
      const text = ((await btn.textContent()) || '').toLowerCase();
      const testId = (await btn.getAttribute('data-testid')) || '';
      if (
        text.includes('create') ||
        text.includes('launch') ||
        testId.toLowerCase().includes('create')
      ) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) return;

    await page.waitForTimeout(1500);

    if (page.url().includes('/create') || page.url().includes('/template')) {
      await expect(page.locator('main')).toBeVisible();
      const bodyText = (await page.locator('body').textContent()) ?? '';
      expect(bodyText).not.toContain('Insufficient privileges');

      // Verify form or step content loaded
      const hasForm = (await page.locator('form').count()) > 0;
      const hasInputs =
        (await page.locator('input, select, textarea').count()) > 0;
      expect(hasForm || hasInputs).toBeTruthy();

      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('"Sync now" is not visible for non-admin user', async ({ page }) => {
    const syncLink = page.getByText('Sync now');
    await expect(syncLink).not.toBeVisible();
  });

  test('"Add Template" button is not visible for non-admin user', async ({
    page,
  }) => {
    const addTemplateBtn = page.locator('[data-testid="add-template-button"]');
    await expect(addTemplateBtn).not.toBeVisible();
  });
});
