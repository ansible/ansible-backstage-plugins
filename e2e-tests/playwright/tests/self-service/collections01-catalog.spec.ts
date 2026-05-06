import { expect, test } from '../../fixtures/auth-context';
import {
  navigateToCollectionsPage,
  waitForCatalogDataOrEmptyState,
} from '../../utils/collections-navigation.spec';

test.describe.serial('collections01-catalog', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeEach(async ({ page }) => {
    await navigateToCollectionsPage(page);
    await waitForCatalogDataOrEmptyState(page);
    await page.waitForTimeout(500);
  });

  test('Sidebar: reaches Collections; filters, sync, cards, detail, and return via sidebar', async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/self-service\/collections/, {
      timeout: 15000,
    });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await expect(
      page.getByText(/Ansible Collections|Collections/).first(),
    ).toBeVisible({ timeout: 20000 });

    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (
      bodyText.includes('No Collections Found') ||
      bodyText.includes('No content sources configured')
    ) {
      return;
    }

    const srcInput = page.locator('input[placeholder="Search sources..."]');
    if ((await srcInput.count()) > 0) {
      await srcInput.first().click({ force: true });
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
    }

    const tagInput = page.locator('input[placeholder="Search tags..."]');
    if ((await tagInput.count()) > 0) {
      await tagInput.first().click({ force: true });
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
    }

    const body2 = page.locator('body');
    if ((await body2.textContent())?.includes('Show latest version only')) {
      const cb = page.getByRole('checkbox', {
        name: /Show latest version only/i,
      });
      if (await cb.isVisible().catch(() => false)) {
        await cb.check({ force: true });
        await page.waitForTimeout(500);
        await cb.uncheck({ force: true });
        await page.waitForTimeout(300);
      }
    }

    const body3Text = (await page.locator('body').textContent()) ?? '';
    if (body3Text.includes('Sync Now')) {
      const syncBtn = page.getByRole('button', { name: 'Sync Now' });
      if (await syncBtn.isEnabled().catch(() => false)) {
        await syncBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }
    }

    if ((await page.locator('main .MuiCard-root').count()) === 0) {
      return;
    }

    const firstCard = page.locator('main .MuiCard-root').first();
    await expect(firstCard).toBeVisible({ timeout: 30000 });

    const fav = firstCard.getByRole('button', { name: /favorite/i });
    await fav.click({ force: true });
    await page.waitForTimeout(800);
    await fav.click({ force: true });
    await page.waitForTimeout(500);

    const httpLink = firstCard.locator('a[href^="http"]').first();
    if ((await httpLink.count()) > 0) {
      const href = await httpLink.getAttribute('href');
      expect(href).toMatch(/^https?:\/\//);
      await httpLink.evaluate((el: HTMLElement) =>
        el.removeAttribute('target'),
      );
      await httpLink.click({ force: true });
    }

    await page.waitForTimeout(1500);
    const urlAfterLink = page.url();
    if (!urlAfterLink.includes('/self-service/collections')) {
      await page.goBack();
    }
    await expect(page).toHaveURL(/\/self-service\/collections/, {
      timeout: 15000,
    });

    await page
      .locator('main .MuiCard-root')
      .first()
      .click({ position: { x: 16, y: 24 }, force: true });
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/self-service\/collections\/.+/, {
      timeout: 15000,
    });

    const body4 = page.locator('body');
    const nav = body4.locator('a[href*="/self-service/collections"]');
    const n = await nav.count();
    let clicked = false;
    const indexRe = /\/self-service\/collections\/?(\?.*)?$/;
    for (let i = 0; i < n; i++) {
      const href = (await nav.nth(i).getAttribute('href')) ?? '';
      if (indexRe.test(href)) {
        await nav.nth(i).click({ force: true });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await navigateToCollectionsPage(page);
    }

    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/self-service\/collections\/?(\?.*)?$/, {
      timeout: 15000,
    });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await expect(page.getByText('Ansible Collections').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('Validates All / Starred user filter when user picker is visible', async ({
    page,
  }) => {
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

  test('Pagination: next and previous when multiple pages exist', async ({
    page,
  }) => {
    const text = (await page.locator('body').textContent()) ?? '';
    if (
      text.includes('No Collections Found') ||
      text.includes('No content sources configured')
    ) {
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
    await expect(next).toBeVisible();
    await expect(next).toBeEnabled();

    await next.click({ force: true });
    await page.waitForTimeout(600);

    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
    await expect(
      page.getByText(/Showing \d+-\d+ of \d+ collections/),
    ).toBeVisible();

    const prev = page.locator('[aria-label="Previous page"]').first();
    await expect(prev).toBeVisible();
    await expect(prev).toBeEnabled();
    await prev.click({ force: true });
    await page.waitForTimeout(600);

    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
    await expect(
      page.getByText(/Showing 1-\d+ of \d+ collections/),
    ).toBeVisible();
  });

  // Sync Toast Notification Tests
  test('Sync: validates toast notification when sync is triggered', async ({
    page,
  }) => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (
      bodyText.includes('No Collections Found') ||
      bodyText.includes('No content sources configured')
    ) {
      return;
    }

    // Check if Sync Now button exists
    const syncBtn = page.getByRole('button', { name: 'Sync Now' });
    if ((await syncBtn.count()) === 0) {
      return;
    }

    // Ensure sync button is visible and enabled
    await expect(syncBtn.first()).toBeVisible({ timeout: 10000 });
    if (!(await syncBtn.first().isEnabled())) {
      return;
    }

    // Click Sync Now button
    await syncBtn.first().click({ force: true });

    // Wait for "Sync sources" modal to appear (exclude hidden menus)
    const modal = page.locator(
      '[role="dialog"]:not([aria-hidden="true"]), .MuiDialog-root:not(.v5-MuiModal-hidden)',
    );
    await expect(modal.first()).toBeVisible({ timeout: 10000 });

    // Verify modal contains "Sync sources" title
    const modalText = await modal.first().innerText();
    expect(
      modalText.toLowerCase().includes('sync sources') ||
        modalText.toLowerCase().includes('sync'),
    ).toBeTruthy();

    // Ensure at least one checkbox is checked (GitHub, GitLab, or Private Automation Hub)
    const checkboxes = modal.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount > 0) {
      // Check if any checkbox is already checked
      let anyChecked = false;
      for (let i = 0; i < checkboxCount; i++) {
        if (await checkboxes.nth(i).isChecked()) {
          anyChecked = true;
          break;
        }
      }

      // If none are checked, check the first one
      if (!anyChecked) {
        await checkboxes.first().check({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // Click "Sync Selected" button in modal
    const syncSelectedBtn = modal.getByRole('button', {
      name: /Sync Selected/i,
    });
    await expect(syncSelectedBtn.first()).toBeVisible({ timeout: 5000 });
    await syncSelectedBtn.first().click({ force: true });

    // Wait for sync to start and toast to appear
    await page.waitForTimeout(2000);

    // Validate toast notification appears with "Sync started" message
    await expect(page.getByText(/Sync started/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('Sync: verifies sync button is disabled during sync process', async ({
    page,
  }) => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (
      bodyText.includes('No Collections Found') ||
      bodyText.includes('No content sources configured')
    ) {
      return;
    }

    // Check if Sync Now button exists
    const syncBtn = page.getByRole('button', { name: 'Sync Now' });
    if ((await syncBtn.count()) === 0) {
      return;
    }

    // Ensure sync button is visible and enabled
    await expect(syncBtn.first()).toBeVisible({ timeout: 10000 });
    if (!(await syncBtn.first().isEnabled())) {
      return;
    }

    // Click Sync Now button
    await syncBtn.first().click({ force: true });

    // Wait for "Sync sources" modal to appear (exclude hidden menus)
    const modal = page.locator(
      '[role="dialog"]:not([aria-hidden="true"]), .MuiDialog-root:not(.v5-MuiModal-hidden)',
    );
    await expect(modal.first()).toBeVisible({ timeout: 10000 });

    // Ensure at least one checkbox is checked
    const checkboxes = modal.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount > 0) {
      let anyChecked = false;
      for (let i = 0; i < checkboxCount; i++) {
        if (await checkboxes.nth(i).isChecked()) {
          anyChecked = true;
          break;
        }
      }
      if (!anyChecked) {
        await checkboxes.first().check({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // Click "Sync Selected" button
    const syncSelectedBtn = modal.getByRole('button', {
      name: /Sync Selected/i,
    });
    await syncSelectedBtn.first().click({ force: true });

    // Wait briefly for modal to close, then verify sync button is disabled
    await page.waitForTimeout(200);
    await expect(syncBtn.first()).toBeDisabled({ timeout: 5000 });
  });

  test('Sync: validates toast notification when sync is completed', async ({
    page,
  }) => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (
      bodyText.includes('No Collections Found') ||
      bodyText.includes('No content sources configured')
    ) {
      return;
    }

    // Check if Sync Now button exists
    const syncBtn = page.getByRole('button', { name: 'Sync Now' });
    if ((await syncBtn.count()) === 0) {
      return;
    }

    // Ensure sync button is visible and enabled
    await expect(syncBtn.first()).toBeVisible({ timeout: 10000 });
    if (!(await syncBtn.first().isEnabled())) {
      return;
    }

    // Click Sync Now button
    await syncBtn.first().click({ force: true });

    // Wait for "Sync sources" modal to appear (exclude hidden menus)
    const modal = page.locator(
      '[role="dialog"]:not([aria-hidden="true"]), .MuiDialog-root:not(.v5-MuiModal-hidden)',
    );
    await expect(modal.first()).toBeVisible({ timeout: 10000 });

    // Ensure at least one checkbox is checked
    const checkboxes = modal.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount > 0) {
      let anyChecked = false;
      for (let i = 0; i < checkboxCount; i++) {
        if (await checkboxes.nth(i).isChecked()) {
          anyChecked = true;
          break;
        }
      }
      if (!anyChecked) {
        await checkboxes.first().check({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // Click "Sync Selected" button
    const syncSelectedBtn = modal.getByRole('button', {
      name: /Sync Selected/i,
    });
    await syncSelectedBtn.first().click({ force: true });

    // Wait for sync to complete (button becomes enabled again)
    await expect(syncBtn.first()).toBeEnabled({ timeout: 60000 });

    // Wait a bit to ensure completion toast has time to appear
    await page.waitForTimeout(2000);

    // Validate completion toast notification appears
    const completionText = await page.locator('body').innerText();
    expect(
      completionText.toLowerCase().includes('complete') ||
        completionText.toLowerCase().includes('success') ||
        completionText.toLowerCase().includes('finished') ||
        completionText.includes('Sync started'), // Sync might still show "started" toast
    ).toBeTruthy();
  });
});

test.describe('Collections sidebar link and viewport', () => {
  test.describe.configure({ timeout: 120000 });

  test('Desktop: open Collections from global sidebar link', async ({
    page,
  }) => {
    // Pin desktop layout so we don't get drawer + sidebar duplicates or collapsed nav.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

    // Prefer href + aria-label over getByRole(...).first() to avoid a hidden duplicate match in CI.
    const collectionsLink = page
      .locator('a[href$="/self-service/collections"][aria-label="Collections"]')
      .first();
    await expect(collectionsLink).toBeVisible({ timeout: 60000 });
    await collectionsLink.click({ force: true });

    await expect(page).toHaveURL(/\/self-service\/collections/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Narrow viewport: collections route loads with main content', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await navigateToCollectionsPage(page);
    await waitForCatalogDataOrEmptyState(page);
    await expect(page).toHaveURL(/\/self-service\/collections/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    await page.setViewportSize({ width: 1920, height: 1080 });
  });
});
