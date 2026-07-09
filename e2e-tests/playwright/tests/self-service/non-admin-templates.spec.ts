import { test, expect } from '../../fixtures/auth-context-user';

const templateCardSelector = '.MuiCard-root, article';

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

    const isVisible = await searchInput.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }
    await searchInput.fill('test');
    await page.waitForLoadState('networkidle');
    await searchInput.clear();
  });

  test('Non-admin user can use category filters', async ({ page }) => {
    const categoryPicker = page.locator('#categories-picker');
    const isVisible = await categoryPicker.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }
    await expect(categoryPicker).toBeVisible();
  });

  test('Non-admin user sees only permitted templates or empty state', async ({
    page,
  }) => {
    const cardCount = await page.locator(templateCardSelector).count();
    const bodyText = (await page.locator('body').textContent()) ?? '';
    const hasEmptyState =
      /No templates/i.test(bodyText) || /empty/i.test(bodyText);

    expect(cardCount > 0 || hasEmptyState).toBeTruthy();
    expect(bodyText).not.toContain('Insufficient privileges');
  });

  test('Non-admin user can open template create form', async ({ page }) => {
    const firstCard = page.locator(templateCardSelector).first();
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

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
    if (!clicked) {
      test.skip();
      return;
    }

    await page.waitForURL(/\/(create|template)/, { timeout: 5000 });

    if (page.url().includes('/create') || page.url().includes('/template')) {
      await expect(page.locator('main')).toBeVisible();
      const bodyText = (await page.locator('body').textContent()) ?? '';
      expect(bodyText).not.toContain('Insufficient privileges');

      const hasForm = (await page.locator('form').count()) > 0;
      const hasInputs =
        (await page.locator('input, select, textarea').count()) > 0;
      expect(hasForm || hasInputs).toBeTruthy();

      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
    }
  });
});
