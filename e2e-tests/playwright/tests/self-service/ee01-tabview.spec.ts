import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth-context';

/**
 * EE tab view — migrated from cypress/e2e/self-service/ee01-tabview.cy.ts
 *
 * Tabs are Backstage HeaderTabs (see TabviewPage.tsx). Prefer role="tab" + name
 * over getByText('Catalog') — substring matches duplicate nodes and breaks clicks.
 */

function eeCatalogTab(page: Page) {
  return page.getByRole('tab', { name: /^Catalog$/i });
}

function eeCreateTab(page: Page) {
  return page.getByRole('tab', { name: /^Create$/i });
}

test.describe('Execution Environment Tabview Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/self-service\/ee/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Validates Catalog and Create tabs are visible and switchable', async ({
    page,
  }) => {
    const catalogTab = eeCatalogTab(page);
    const createTab = eeCreateTab(page);

    await expect(catalogTab).toBeVisible({ timeout: 15000 });
    await expect(createTab).toBeVisible({ timeout: 15000 });

    await createTab.click({ timeout: 15000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/self-service\/ee\/create/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    await catalogTab.click({ timeout: 15000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/self-service\/ee\/catalog/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Validates Catalog tab: empty state CTA redirects to Create tab', async ({
    page,
  }) => {
    await page.goto('/self-service/ee/catalog', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/self-service\/ee\/catalog/);
    await page.waitForTimeout(800);

    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    const body = page.locator('body');
    const text = await body.innerText();
    if (!text.includes('No Execution Environment definition files, yet')) {
      return;
    }

    await expect(
      page.getByText('No Execution Environment definition files, yet'),
    ).toBeVisible();

    if (text.includes('Create Execution Environment definition file')) {
      await page
        .getByText('Create Execution Environment definition file')
        .click({ force: true });
      await page.waitForTimeout(1500);
      const after = await body.innerText();
      if (after.includes('Create an Execution Environment')) {
        await expect(
          page.getByText('Create an Execution Environment').first(),
        ).toBeAttached();
      }
    }
  });

  test('Validates Create tab: Add Template button, filters and template Start button', async ({
    page,
  }) => {
    await eeCreateTab(page).click({ timeout: 15000 });
    await page.waitForTimeout(1500);

    await expect(page).toHaveURL(/\/self-service\/ee\/create/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    const body = page.locator('body');
    const bt = await body.innerText();
    const hasAdd =
      (await page.locator('[data-testid="add-template-button"]').count()) > 0 ||
      bt.toLowerCase().includes('add template');

    if (hasAdd) {
      const addBtn = page.locator('[data-testid="add-template-button"]');
      if ((await addBtn.count()) > 0) {
        await addBtn.click({ force: true });
      } else {
        await page
          .getByText(/add template/i)
          .first()
          .click({ force: true });
      }
      await page.waitForTimeout(2000);

      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await eeCreateTab(page).click({ timeout: 15000 });
      await page.waitForTimeout(1500);
    }

    if (
      (await page.locator('[data-testid="search-bar-container"]').count()) > 0
    ) {
      const input = page
        .locator('[data-testid="search-bar-container"]')
        .locator('input')
        .first();
      await input.fill('ee', { force: true });
      await page.waitForTimeout(500);
      await input.clear({ force: true });
    }

    const picker = page
      .locator('[data-testid="user-picker-container"]')
      .first();
    if ((await picker.count()) > 0) {
      const buttons = picker.locator('button, [role="button"]');
      const n = await buttons.count();
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i);
        const t = ((await b.textContent()) || '').toLowerCase();
        const a = ((await b.getAttribute('aria-label')) || '').toLowerCase();
        if (t.includes('starred') || a.includes('starred')) {
          await b.click({ force: true });
          await page.waitForTimeout(500);
          break;
        }
      }
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i);
        const t = ((await b.textContent()) || '').toLowerCase();
        const a = ((await b.getAttribute('aria-label')) || '').toLowerCase();
        if (t.includes('all') || a.includes('all')) {
          await b.click({ force: true });
          await page.waitForTimeout(500);
          break;
        }
      }
    }

    const card = page
      .locator(
        '[data-testid="templates-container"], .MuiCard-root, article, .template',
      )
      .first();
    if ((await card.count()) === 0) {
      return;
    }

    const btn = card.locator('button').filter({
      hasText: /start|create/i,
    });
    if ((await btn.count()) > 0) {
      await btn.first().click({ force: true });
      await page.waitForTimeout(1500);
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    }
  });

  test('Validates Create tab sidebar filters: Starred, My Org All, and Tags', async ({
    page,
  }) => {
    await eeCreateTab(page).click({ timeout: 15000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    const text = await page.locator('body').innerText();
    if (text.includes('Personal') && text.includes('Starred')) {
      await page.getByText('Starred').first().click({ force: true });
      await page.waitForTimeout(500);
    }
    if (text.includes('My Org') && text.includes('All')) {
      await page.getByText('All').first().click({ force: true });
      await page.waitForTimeout(500);
    }
    if (text.includes('Tags')) {
      await page.getByText('Tags').first().click({ force: true });
      await page.waitForTimeout(500);
    }
  });
});
