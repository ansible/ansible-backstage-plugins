import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth-context';
import {
  clickCollectionsBreadcrumbToCatalog,
  navigateToCollectionDetailPath,
  navigateToCollectionsPage,
  waitForCatalogDataOrEmptyState,
} from '../../utils/collections-navigation.spec';

const COLLECTIONS_INDEX_RE = /\/self-service\/collections\/?(\?.*)?$/;

async function navigateToCollectionsIndexViaSidebar(page: Page): Promise<void> {
  const nav = page.locator('body a[href*="/self-service/collections"]');
  const count = await nav.count();
  for (let i = 0; i < count; i++) {
    const link = nav.nth(i);
    const href = (await link.getAttribute('href')) ?? '';
    if (COLLECTIONS_INDEX_RE.test(href)) {
      await link.click({ force: true });
      await page.waitForURL(COLLECTIONS_INDEX_RE, { timeout: 15000 });
      await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
      return;
    }
  }
  await navigateToCollectionsPage(page);
}

test.describe.serial('collections02-detail', () => {
  test.describe.configure({ timeout: 180000 });

  test.describe('Collections Detail Page', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToCollectionsPage(page);
      await waitForCatalogDataOrEmptyState(page);
      await page.waitForTimeout(500);
    });

    test('Detail view: sidebar → card → View Source, About, Resources, sidebar to catalog', async ({
      page,
    }) => {
      const bodyText = (await page.locator('body').textContent()) ?? '';
      if (
        bodyText.includes('No Collections Found') ||
        bodyText.includes('No content sources configured')
      ) {
        return;
      }
      if ((await page.locator('main .MuiCard-root').count()) === 0) {
        return;
      }

      await page
        .locator('main .MuiCard-root')
        .first()
        .click({ position: { x: 16, y: 24 }, force: true });
      await expect(page).toHaveURL(/\/self-service\/collections\/.+/, {
        timeout: 60000,
      });
      await expect(
        page.getByText('About', { exact: false }).first(),
      ).toBeVisible({
        timeout: 120000,
      });

      const hasViewSource = await page
        .locator('button')
        .filter({ hasText: 'View Source' })
        .count()
        .then(c => c > 0);
      if (hasViewSource) {
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 20000 }),
          page
            .getByRole('button', { name: 'View Source' })
            .first()
            .click({ force: true }),
        ]);
        expect(popup.url()).toMatch(/^https?:\/\//);
        await popup.close();
        await expect(page).toHaveURL(/\/self-service\/collections\/.+/);
      }

      const aboutCard = page
        .locator('.MuiCard-root')
        .filter({ hasText: 'About' })
        .first();
      await aboutCard.locator('button').first().click({ force: true });
      await page.waitForTimeout(1200);
      await expect(page).toHaveURL(/\/self-service\/collections\/.+/);

      const aboutCard2 = page
        .locator('.MuiCard-root')
        .filter({ hasText: 'About' })
        .first();
      const aboutSourceLink = aboutCard2.locator('a[href^="http"]').first();
      if ((await aboutSourceLink.count()) > 0) {
        await aboutSourceLink.click({ force: true });
        await page.waitForTimeout(500);
        await expect(page).toHaveURL(/\/self-service\/collections\/.+/);
      }

      const pageText = (await page.locator('body').textContent()) ?? '';
      if (pageText.includes('Resources')) {
        const resourcesCard = page
          .locator('.MuiCard-root')
          .filter({ hasText: 'Resources' })
          .first();
        const total = await resourcesCard.locator('a[href^="http"]').count();
        for (let i = 0; i < total; i++) {
          const card = page
            .locator('.MuiCard-root')
            .filter({ hasText: 'Resources' })
            .first();
          const link = card.locator('a[href^="http"]').nth(i);
          await link.evaluate((el: HTMLElement) =>
            el.removeAttribute('target'),
          );
          await link.click({ force: true });
          await page.waitForTimeout(1000);
          const url = page.url();
          if (!url.includes('/self-service/collections/')) {
            await page.goBack();
          }
          await expect(page).toHaveURL(/\/self-service\/collections\/.+/, {
            timeout: 20000,
          });
        }
      }

      await navigateToCollectionsIndexViaSidebar(page);
      await expect(
        page.getByText(/Ansible Collections|Collections/).first(),
      ).toBeVisible({ timeout: 20000 });
    });

    test('Detail overview: Overview tab, README card, Last Sync, optional PAH badge', async ({
      page,
    }) => {
      const bodyText = (await page.locator('body').textContent()) ?? '';
      if (
        bodyText.includes('No Collections Found') ||
        bodyText.includes('No content sources configured')
      ) {
        return;
      }
      if ((await page.locator('main .MuiCard-root').count()) === 0) {
        return;
      }

      await page
        .locator('main .MuiCard-root')
        .first()
        .click({ position: { x: 16, y: 24 }, force: true });
      await expect(page).toHaveURL(/\/self-service\/collections\/.+/, {
        timeout: 60000,
      });

      await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({
        timeout: 60000,
      });

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

      try {
        await expect(
          readmeCard.getByText(
            'No README content available for this collection.',
          ),
        ).toBeVisible({ timeout: 5000 });
      } catch {
        await expect(readmeCard.locator('.MuiBox-root').last()).toBeVisible({
          timeout: 15000,
        });
      }

      await expect(
        page.getByText('Last Sync', { exact: true }).first(),
      ).toBeVisible({ timeout: 30000 });

      const badge = page.getByText(/^(Certified|Validated|Community)$/);
      if ((await badge.count()) > 0) {
        await expect(badge.first()).toBeVisible();
      }
    });
  });

  test.describe('Collections Detail Page — edge routes', () => {
    test('Unknown slug: empty state, breadcrumb to catalog', async ({
      page,
    }) => {
      await navigateToCollectionDetailPath(
        page,
        'e2e-nonexistent-collection-slug',
      );
      await page.waitForTimeout(2000);

      await expect(page).toHaveURL(
        /\/self-service\/collections\/e2e-nonexistent-collection-slug/,
        { timeout: 15000 },
      );
      await expect(
        page.getByRole('heading', { name: 'No Collections Found' }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        page.getByText('Collections', { exact: false }).first(),
      ).toBeVisible();

      await clickCollectionsBreadcrumbToCatalog(page);
      await expect(page).toHaveURL(/\/self-service\/collections\/?(\?.*)?$/, {
        timeout: 15000,
      });
    });
  });
});
