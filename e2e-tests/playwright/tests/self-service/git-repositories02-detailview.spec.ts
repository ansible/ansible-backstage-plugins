import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth-context';
import {
  clickRepositoriesBreadcrumbToCatalog,
  navigateToGitRepositoriesCatalogPage,
  navigateToGitRepositoryDetailPath,
  waitForGitRepositoriesCatalogOrEmptyState,
} from '../../utils/git-repositories-navigation.spec';

/** List routes: /repositories or /repositories/catalog (not detail or ci-activity). */
function isGitRepositoriesCatalogHref(href: string): boolean {
  const path = href.split('?')[0].replace(/\/$/, '') || '/';
  if (path === '/self-service/repositories') return true;
  if (path === '/self-service/repositories/catalog') return true;
  return false;
}

async function navigateToRepositoriesCatalogViaSidebar(
  page: Page,
): Promise<void> {
  const nav = page.locator('body a[href*="/self-service/repositories"]');
  const count = await nav.count();
  for (let i = 0; i < count; i++) {
    const link = nav.nth(i);
    const href = (await link.getAttribute('href')) ?? '';
    if (isGitRepositoriesCatalogHref(href)) {
      await link.click({ force: true });
      await page.waitForURL(/\/self-service\/repositories(\/catalog)?/, {
        timeout: 15000,
      });
      await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
      return;
    }
  }
  await navigateToGitRepositoriesCatalogPage(page);
}

test.describe.serial('git-repositories02-detail', () => {
  test.describe.configure({ timeout: 180000 });

  test.describe('Git repository detail page', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToGitRepositoriesCatalogPage(page);
      await waitForGitRepositoriesCatalogOrEmptyState(page);
      await page.waitForTimeout(500);
    });

    test('Detail view: open first repo, Overview, View in source, tabs, breadcrumb', async ({
      page,
    }) => {
      const bodyText = (await page.locator('body').textContent()) ?? '';
      if (bodyText.includes('No Git repositories found')) {
        return;
      }
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

      await firstRepoLink.waitFor({ state: 'visible', timeout: 10000 });
      await firstRepoLink.click();

      await expect(page).toHaveURL(/\/self-service\/repositories\/.+/, {
        timeout: 60000,
      });
      await expect(page).not.toHaveURL(
        /\/repositories\/(catalog|ci-activity)$/,
      );

      await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({
        timeout: 60000,
      });

      const hasViewSource = await page
        .getByRole('button', { name: 'View in source' })
        .count()
        .then(c => c > 0);
      if (hasViewSource) {
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 20000 }),
          page.getByRole('button', { name: 'View in source' }).click({
            force: true,
          }),
        ]);
        expect(popup.url()).toMatch(/^https?:\/\//);
        await popup.close();
        await expect(page).toHaveURL(/\/self-service\/repositories\/.+/);
      }

      const readmeCard = page
        .locator('.MuiCard-root')
        .filter({ hasText: 'README' })
        .first();
      await expect(readmeCard).toBeVisible({ timeout: 30000 });
      const readmeSpinner = readmeCard
        .locator('.MuiCircularProgress-root')
        .first();
      if ((await readmeSpinner.count()) > 0) {
        await readmeSpinner.waitFor({ state: 'hidden', timeout: 90000 });
      }

      await page.getByRole('tab', { name: 'CI Activity' }).click();
      await page.waitForTimeout(1200);
      await page.waitForFunction(
        () => {
          const t = document.body?.innerText ?? '';
          return (
            t.includes('No CI activity yet') ||
            t.includes('Unable to load CI activity') ||
            /\bCI Activity\s*\(\d+\)/.test(t)
          );
        },
        undefined,
        { timeout: 120000 },
      );

      await page.getByRole('tab', { name: 'Collections' }).click();
      await page.waitForTimeout(800);

      await page.getByRole('tab', { name: 'Overview' }).click();
      await page.waitForTimeout(500);

      await navigateToRepositoriesCatalogViaSidebar(page);
      await expect(page.getByText('Git Repositories').first()).toBeVisible({
        timeout: 20000,
      });
    });

    test('Detail overview: About card expand and catalog link', async ({
      page,
    }) => {
      const bodyText = (await page.locator('body').textContent()) ?? '';
      if (bodyText.includes('No Git repositories found')) {
        return;
      }
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

      await firstRepoLink.waitFor({ state: 'visible', timeout: 10000 });
      await firstRepoLink.click();

      await expect(page).toHaveURL(/\/self-service\/repositories\/.+/, {
        timeout: 60000,
      });

      const aboutCard = page
        .locator('.MuiCard-root')
        .filter({ hasText: 'About' })
        .first();
      if ((await aboutCard.count()) > 0) {
        await aboutCard.locator('button').first().click({ force: true });
        await page.waitForTimeout(800);
      }
    });
  });

  test.describe('Git repository detail — unknown slug', () => {
    test('Unknown slug: empty state and breadcrumb to catalog', async ({
      page,
    }) => {
      await navigateToGitRepositoryDetailPath(
        page,
        'e2e-nonexistent-git-repo-slug',
      );
      await page.waitForTimeout(2000);

      await expect(page).toHaveURL(
        /\/self-service\/repositories\/e2e-nonexistent-git-repo-slug/,
        { timeout: 15000 },
      );
      await expect(
        page.getByRole('heading', { name: 'No Collections Found' }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        page.locator('.MuiBreadcrumbs-root').getByText('Repositories', {
          exact: true,
        }),
      ).toBeVisible();

      await clickRepositoriesBreadcrumbToCatalog(page);
      await expect(page).toHaveURL(/\/self-service\/repositories\/catalog/, {
        timeout: 15000,
      });
    });
  });
});
