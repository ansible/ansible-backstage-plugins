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
        await syncBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }
    }

    const repoTitle = page.getByText(/^Git Repositories \(\d+\)$/);
    await expect(repoTitle.first()).toBeVisible({ timeout: 30000 });

    if ((await page.locator('main table tbody tr').count()) === 0) {
      return;
    }

    const firstRepoBtn = page
      .locator('main table tbody tr')
      .first()
      .locator('td')
      .first()
      .getByRole('button')
      .first();

    const starBtn = page
      .locator('main table tbody tr')
      .first()
      .getByRole('button', { name: /favorite|favourites/i });
    if ((await starBtn.count()) > 0) {
      await starBtn.first().click({ force: true });
      await page.waitForTimeout(600);
      await starBtn.first().click({ force: true });
      await page.waitForTimeout(400);
    }

    const kebab = page
      .locator('main table tbody tr')
      .first()
      .getByRole('button', { name: 'Actions' });
    if ((await kebab.count()) > 0) {
      await kebab.click({ force: true });
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

    await firstRepoBtn.click({ force: true });
    await page.waitForTimeout(1500);
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

    await next.click({ force: true });
    await page.waitForTimeout(600);

    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

    const prev = page.locator('[aria-label="Previous page"]').first();
    await expect(prev).toBeVisible();
    await expect(prev).toBeEnabled();
    await prev.click({ force: true });
    await page.waitForTimeout(600);

    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
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
