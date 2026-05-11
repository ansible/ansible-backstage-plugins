import type { Page } from '@playwright/test';
import { loginAAP } from './auth';

/** Multi-provider Backstage sign-in screen (session missing / expired). */
function signInPicker(page: Page) {
  return page
    .getByRole('heading', { name: /select a sign-in method/i })
    .or(page.getByText(/Select a sign-in method/i));
}

async function reloadGitRepositoriesCatalog(page: Page): Promise<void> {
  await page.goto('/self-service/repositories/catalog', {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
}

/**
 * Opens the Git Repositories catalog tab and re-runs AAP login if the app shows
 * the multi-provider sign-in screen.
 */
export async function navigateToGitRepositoriesCatalogPage(
  page: Page,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await reloadGitRepositoriesCatalog(page);
    if (
      await signInPicker(page)
        .isVisible()
        .catch(() => false)
    ) {
      await loginAAP(page);
      continue;
    }
    return;
  }
  throw new Error(
    'Still on sign-in picker after login retries; check AAP/session and BASE_URL.',
  );
}

/**
 * Opens a Git repository detail URL (or unknown slug). Re-authenticates if the
 * app shows the sign-in picker.
 */
export async function navigateToGitRepositoryDetailPath(
  page: Page,
  slug: string,
): Promise<void> {
  const path = `/self-service/repositories/${slug}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page
      .locator('main')
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    if (
      await signInPicker(page)
        .isVisible()
        .catch(() => false)
    ) {
      await loginAAP(page);
      continue;
    }
    return;
  }
  throw new Error(
    `Still on sign-in picker after login retries (path ${path}).`,
  );
}

/**
 * Navigates to the CI Activity tab at the list level (not the detail sub-tab).
 */
export async function navigateToGitRepositoriesCIActivityPage(
  page: Page,
): Promise<void> {
  const path = '/self-service/repositories/ci-activity';
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    if (
      await signInPicker(page)
        .isVisible()
        .catch(() => false)
    ) {
      await loginAAP(page);
      continue;
    }
    return;
  }
  throw new Error(
    'Still on sign-in picker after login retries (CI Activity path).',
  );
}

/**
 * Clicks the "Repositories" segment in breadcrumbs to return to the catalog
 * list from the detail page.
 */
export async function clickRepositoriesBreadcrumbToCatalog(
  page: Page,
): Promise<void> {
  const crumb = page
    .locator('.MuiBreadcrumbs-root')
    .getByText('Repositories', { exact: true })
    .first();
  await crumb.click();
  await page.waitForURL(/\/self-service\/repositories\/catalog/, {
    timeout: 20000,
  });
  await page
    .locator('main')
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
}

export async function waitForGitRepositoriesCatalogOrEmptyState(
  page: Page,
): Promise<void> {
  if (
    await signInPicker(page)
      .isVisible()
      .catch(() => false)
  ) {
    await loginAAP(page);
    await reloadGitRepositoriesCatalog(page);
  }

  await page.waitForFunction(
    () => {
      const body = document.body?.innerText ?? '';
      if (body.includes('No Git repositories found')) {
        return true;
      }
      if (/\bGit Repositories\s*\(\d+\)/.test(body)) {
        return true;
      }
      const table = document.querySelector('main table tbody');
      if (table && table.querySelectorAll('tr').length > 0) {
        return true;
      }
      if (body.includes('Error:')) {
        return true;
      }
      return false;
    },
    undefined,
    { timeout: 120000 },
  );
}

export async function waitForGitRepositoriesCIActivityLoaded(
  page: Page,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const body = document.body?.innerText ?? '';
      if (body.includes('No CI activity yet')) {
        return true;
      }
      if (body.includes('Unable to load CI activity')) {
        return true;
      }
      if (/\bCI Activity\s*\(\d+\)/.test(body)) {
        return true;
      }
      const table = document.querySelector('main table tbody');
      if (table && table.querySelectorAll('tr').length > 0) {
        return true;
      }
      return false;
    },
    undefined,
    { timeout: 120000 },
  );
}
