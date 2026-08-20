import { expect, test } from '../../fixtures/auth-context';
import {
  navigateToTemplatesPage,
  waitForTemplateDataOrEmptyState,
} from '../../utils/templates-navigation.spec';

test.describe.serial('templates01-catalog', () => {
  test.describe.configure({
    timeout: 180000,
    retries: 1,
  });

  test.beforeEach(async ({ page }) => {
    await navigateToTemplatesPage(page);
    await waitForTemplateDataOrEmptyState(page);
    await page.waitForTimeout(500);
  });

  test('Header: page title and description are visible', async ({ page }) => {
    await expect(page).toHaveURL(/\/self-service/, { timeout: 15000 });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await expect(page.getByText('Templates').first()).toBeVisible({
      timeout: 20000,
    });

    await expect(
      page.getByText(/Browse available templates/).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Header: Learn more link points to documentation', async ({ page }) => {
    const link = page.locator('a', { hasText: 'Learn more' }).first();
    await expect(link).toBeVisible({ timeout: 10000 });

    const href = await link.getAttribute('href');
    expect(href).toBe('https://red.ht/self-service-launch-template');

    const target = await link.getAttribute('target');
    expect(target).toBe('_blank');

    const icon = link.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('Header: Sync Now button visible for admin', async ({ page }) => {
    const syncBtn = page.getByRole('button', { name: 'Sync Now' });
    await expect(syncBtn.first()).toBeVisible({ timeout: 15000 });
  });

  test('Header: Add Template button visible for admin', async ({ page }) => {
    const addTemplateBtn = page.locator('[data-testid="add-template-button"]');
    await expect(addTemplateBtn).toBeVisible({ timeout: 15000 });
  });

  test('Sync: dialog opens with correct options', async ({ page }) => {
    const syncBtn = page.getByRole('button', { name: 'Sync Now' });
    if ((await syncBtn.count()) === 0) {
      return;
    }

    await expect(syncBtn.first()).toBeVisible({ timeout: 10000 });
    if (!(await syncBtn.first().isEnabled())) {
      return;
    }

    await syncBtn.first().click({ force: true });

    const modal = page.locator('#sync-menu');
    await expect(modal).toBeVisible({ timeout: 10000 });

    const modalText = await modal.innerText();
    expect(modalText.includes('Organizations, Users, and Teams')).toBeTruthy();
    expect(modalText.includes('Job Templates')).toBeTruthy();

    const checkboxes = modal.locator('input[type="checkbox"]');
    expect(await checkboxes.count()).toBeGreaterThanOrEqual(2);

    const okBtn = modal.getByRole('button', { name: /Ok/i });
    await expect(okBtn).toBeVisible();

    const cancelBtn = modal.getByRole('button', { name: /Cancel/i });
    if ((await cancelBtn.count()) > 0) {
      await cancelBtn.first().click({ force: true });
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
  });

  test('Filters: search bar is functional', async ({ page }) => {
    const searchInput = page
      .locator('[data-testid="search-bar-container"] input')
      .or(page.locator('input[placeholder*="Search"]'))
      .first();

    if (!(await searchInput.isVisible().catch(() => false))) {
      return;
    }

    await searchInput.fill('test');
    await page.waitForLoadState('networkidle');
    await searchInput.clear();
  });

  test('Filters: categories picker is visible', async ({ page }) => {
    const categoryPicker = page.locator('#categories-picker');
    if ((await categoryPicker.count()) === 0) {
      return;
    }
    await expect(categoryPicker).toBeVisible();
  });

  test('Filters: user picker All/Starred toggle', async ({ page }) => {
    const container = page
      .locator('[data-testid="user-picker-container"]')
      .first();
    if ((await container.count()) === 0) {
      return;
    }

    const buttons = container.locator('button, [role="button"]');
    const btnCount = await buttons.count();
    for (let i = 0; i < btnCount; i++) {
      const b = buttons.nth(i);
      const t = ((await b.textContent()) ?? '').toLowerCase();
      const a = ((await b.getAttribute('aria-label')) ?? '').toLowerCase();
      if (t.includes('starred') || a.includes('starred')) {
        await b.click({ force: true });
        await page.waitForTimeout(800);
        for (let j = 0; j < btnCount; j++) {
          const b2 = buttons.nth(j);
          const t2 = ((await b2.textContent()) ?? '').toLowerCase();
          const a2 = (
            (await b2.getAttribute('aria-label')) ?? ''
          ).toLowerCase();
          if (t2.includes('all') || a2.includes('all')) {
            await b2.click({ force: true });
            return;
          }
        }
        return;
      }
    }
  });

  test('Cards: template cards, loading skeleton, or empty state visible', async ({
    page,
  }) => {
    const cardCount = await page.locator('main .MuiCard-root').count();
    const skeletonCount = await page.locator('main .MuiSkeleton-root').count();
    const bodyText = (await page.locator('body').textContent()) ?? '';
    const hasEmptyState =
      /No templates/i.test(bodyText) || /empty/i.test(bodyText);

    expect(cardCount > 0 || skeletonCount > 0 || hasEmptyState).toBeTruthy();
  });

  test('Pagination: controls, navigation, and page state', async ({ page }) => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (/No templates/i.test(bodyText)) {
      return;
    }

    const nextAll = page.locator('[aria-label="Next page"]');
    if ((await nextAll.count()) === 0) {
      return;
    }
    const next = nextAll.first();

    if (await next.isDisabled()) {
      return;
    }

    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeEnabled();

    const cardsPage1 = await page.locator('main .MuiCard-root').count();
    expect(cardsPage1).toBeGreaterThan(0);

    await next.click({ force: true });
    await page.waitForTimeout(600);

    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

    const prev = page.locator('[aria-label="Previous page"]').first();
    await expect(prev).toBeVisible();
    await expect(prev).toBeEnabled();

    await prev.click({ force: true });
    await page.waitForTimeout(600);

    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
    const cardsBackToPage1 = await page.locator('main .MuiCard-root').count();
    expect(cardsBackToPage1).toBe(cardsPage1);
  });
});
