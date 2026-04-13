import type { Page } from '@playwright/test';
import { loginAAP } from './auth';

/** Multi-provider Backstage sign-in screen (session missing / expired). */
function signInPicker(page: Page) {
  return page
    .getByRole('heading', { name: /select a sign-in method/i })
    .or(page.getByText(/Select a sign-in method/i));
}

async function reloadCollectionsIndex(page: Page): Promise<void> {
  await page.goto('/self-service/collections', {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
}

/**
 * Opens the collections catalog and re-runs AAP login if the app shows the
 * multi-provider sign-in screen (session expired or redirect to login).
 * Retries: first navigation can succeed on `main` before the picker paints, or
 * login can succeed without sticking until a second trip.
 */
export async function navigateToCollectionsPage(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await reloadCollectionsIndex(page);
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
 * Opens a collection detail URL (or unknown slug). Re-authenticates if the app
 * shows the sign-in picker.
 */
export async function navigateToCollectionDetailPath(
  page: Page,
  slug: string,
): Promise<void> {
  const path = `/self-service/collections/${slug}`;
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
 * Clicks the "Collections" segment in MUI breadcrumbs (CollectionBreadcrumbs)
 * to return to the catalog index from detail or unknown-slug empty state.
 */
export async function clickCollectionsBreadcrumbToCatalog(
  page: Page,
): Promise<void> {
  const crumb = page
    .locator('.MuiBreadcrumbs-root')
    .getByText('Collections', { exact: true })
    .first();
  await crumb.click();
  await page.waitForURL(/\/self-service\/collections\/?(\?.*)?$/, {
    timeout: 20000,
  });
  await page
    .locator('main')
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
}

export async function waitForCatalogDataOrEmptyState(
  page: Page,
): Promise<void> {
  if (
    await signInPicker(page)
      .isVisible()
      .catch(() => false)
  ) {
    await loginAAP(page);
    await reloadCollectionsIndex(page);
  }

  await page.waitForFunction(
    () => {
      const body = document.body?.innerText ?? '';
      if (
        body.includes('No Collections Found') ||
        body.includes('No content sources configured')
      ) {
        return true;
      }
      if (document.querySelectorAll('main .MuiCard-root').length > 0) {
        return true;
      }
      if (/\bAnsible Collections\s*\(\d+\)/.test(body)) {
        return true;
      }
      const search = document.querySelector('main input[placeholder="Search"]');
      if (search instanceof HTMLInputElement && !search.disabled) {
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
