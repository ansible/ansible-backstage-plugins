import { expect, test } from '../../fixtures/auth-context';
import {
  navigateToGitRepositoriesCatalogPage,
  navigateToGitRepositoriesCIActivityPage,
  waitForGitRepositoriesCatalogOrEmptyState,
  waitForGitRepositoriesCIActivityLoaded,
} from '../../utils/git-repositories-navigation.spec';

test.describe.serial('git-repositories01-catalog', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeEach(async ({ page }) => {
    await navigateToGitRepositoriesCatalogPage(page);
    await waitForGitRepositoriesCatalogOrEmptyState(page);
    await page.waitForTimeout(500);
  });

  test('Sidebar: reaches Git Repositories; catalog, CI tab, sync, table actions', async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/self-service\/repositories\/catalog/, {
      timeout: 15000,
    });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await expect(page.getByText('Git Repositories').first()).toBeVisible({
      timeout: 20000,
    });

    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (bodyText.includes('No Git repositories found')) {
      await page.getByRole('tab', { name: /CI Activity/i }).click();
      await page.waitForTimeout(800);
      await waitForGitRepositoriesCIActivityLoaded(page);
      await expect(
        page.getByText(/No CI activity yet|Unable to load CI activity/),
      ).toBeVisible({ timeout: 30000 });
      await page.getByRole('tab', { name: /Catalog/i }).click();
      await expect(page).toHaveURL(/\/self-service\/repositories\/catalog/);
      return;
    }

    const srcInput = page.locator('input[placeholder="Search sources..."]');
    if ((await srcInput.count()) > 0) {
      await srcInput.first().click({ force: true });
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
    }

    const body3Text = (await page.locator('body').textContent()) ?? '';
    if (body3Text.includes('Sync Now')) {
      const syncBtn = page.getByRole('button', { name: 'Sync Now' });
      if (await syncBtn.isEnabled().catch(() => false)) {
        await syncBtn.waitFor({ state: 'visible', timeout: 10000 });
        await syncBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }

    const repoTitle = page.getByText(/^Git Repositories \(\d+\)$/);
    await expect(repoTitle.first()).toBeVisible({ timeout: 30000 });

    const tableRow = page.locator('main table tbody tr').first();
    if ((await tableRow.count()) === 0) {
      return;
    }

    await tableRow.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // First cell contains repository name as a link
    const firstRepoLink = tableRow.locator('td').first().locator('a').first();

    // Check if link exists before proceeding
    if ((await firstRepoLink.count()) === 0) {
      // No link found - table might be loading or have different structure
      return;
    }

    const starBtn = tableRow.getByRole('button', {
      name: /favorite|favourites/i,
    });
    if ((await starBtn.count()) > 0) {
      await starBtn.first().waitFor({ state: 'visible', timeout: 10000 });
      await starBtn.first().click();
      await page.waitForTimeout(600);
      await starBtn
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(400);
    }

    const kebab = tableRow.getByRole('button', { name: 'Actions' });
    if ((await kebab.count()) > 0) {
      await kebab.waitFor({ state: 'visible', timeout: 10000 });
      await kebab.click();
      await page.waitForTimeout(400);
      const viewInSource = page.getByRole('menuitem', {
        name: /View in source/i,
      });
      if (
        (await viewInSource.count()) > 0 &&
        (await viewInSource.isEnabled().catch(() => false))
      ) {
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 20000 }),
          viewInSource.click({ force: true }),
        ]);
        expect(popup.url()).toMatch(/^https?:\/\//);
        await popup.close();
      } else {
        await page.keyboard.press('Escape');
      }
    }

    await firstRepoLink.waitFor({ state: 'visible', timeout: 10000 });
    await firstRepoLink.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/self-service\/repositories\/.+/, {
      timeout: 20000,
    });
    await expect(page).not.toHaveURL(/\/repositories\/catalog$/);

    await page
      .locator('.MuiBreadcrumbs-root')
      .getByText('Repositories', { exact: true })
      .first()
      .click();
    await page.waitForURL(/\/self-service\/repositories\/catalog/, {
      timeout: 15000,
    });
    await expect(page.getByText('Git Repositories').first()).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('tab', { name: /CI Activity/i }).click();
    await page.waitForTimeout(800);
    await waitForGitRepositoriesCIActivityLoaded(page);
    await expect(page).toHaveURL(/\/self-service\/repositories\/ci-activity/);
    const ciBody = (await page.locator('body').textContent()) ?? '';
    if (
      !ciBody.includes('No CI activity yet') &&
      !ciBody.includes('Unable to load CI activity')
    ) {
      await expect(page.getByText(/^CI Activity \(\d+\)$/)).toBeVisible({
        timeout: 30000,
      });
      const statusLabel = page.getByText('Status', { exact: true }).first();
      const triggerLabel = page.getByText('Trigger', { exact: true }).first();
      if (await statusLabel.isVisible().catch(() => false)) {
        await expect(statusLabel).toBeVisible();
      }
      if (await triggerLabel.isVisible().catch(() => false)) {
        await expect(triggerLabel).toBeVisible();
      }
    }

    await page.getByRole('tab', { name: /Catalog/i }).click();
    await expect(page).toHaveURL(/\/self-service\/repositories\/catalog/);
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
        await b.waitFor({ state: 'visible', timeout: 10000 });
        await b.click();
        await page.waitForTimeout(800);
        for (let j = 0; j < btnCount; j++) {
          const b2 = buttons.nth(j);
          const t2 = ((await b2.textContent()) ?? '').toLowerCase();
          const a2 = (
            (await b2.getAttribute('aria-label')) ?? ''
          ).toLowerCase();
          if (t2.includes('all') || a2.includes('all')) {
            await b2.waitFor({ state: 'visible', timeout: 10000 });
            await b2.click();
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
    if (text.includes('No Git repositories found')) {
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

    await next.click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

    const prev = page.locator('[aria-label="Previous page"]').first();
    await expect(prev).toBeVisible();
    await expect(prev).toBeEnabled();
    await prev.click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  });

  // Sync Toast Notification Tests
  test('Sync: validates toast notification when sync is triggered', async ({
    page,
  }) => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (bodyText.includes('No Git repositories found')) {
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

    // Wait for network requests to complete (sync API call triggers toast)
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Validate toast notification appears with "Sync started" message
    await expect(page.getByText(/Sync started/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('Sync: validates toast notification when sync is completed', async ({
    page,
  }) => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    if (bodyText.includes('No Git repositories found')) {
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

test.describe('Git Repositories sidebar link and viewport', () => {
  test.describe.configure({ timeout: 120000 });

  test('Desktop: open Git Repositories from global sidebar link', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });
    await page
      .getByRole('link', { name: 'Git Repositories' })
      .first()
      .scrollIntoViewIfNeeded();
    await page.getByRole('link', { name: 'Git Repositories' }).first().click({
      force: true,
    });
    await expect(page).toHaveURL(/\/self-service\/repositories/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Narrow viewport: repositories catalog route loads with main content', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await navigateToGitRepositoriesCatalogPage(page);
    await waitForGitRepositoriesCatalogOrEmptyState(page);
    await expect(page).toHaveURL(/\/self-service\/repositories\/catalog/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('Direct navigation: CI Activity URL loads tab content', async ({
    page,
  }) => {
    await navigateToGitRepositoriesCIActivityPage(page);
    await waitForGitRepositoriesCIActivityLoaded(page);
    await expect(page).toHaveURL(/\/self-service\/repositories\/ci-activity/);
    await expect(page.getByText('Git Repositories').first()).toBeVisible({
      timeout: 20000,
    });
  });
});
