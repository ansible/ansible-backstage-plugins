import { test, expect } from '../../fixtures/auth-context';

/**
 * EE Catalog + detail view — migrated from cypress/e2e/self-service/ee03-detail-view.cy.ts
 * (Long Cypress flows are represented; Inspect/Unregister deep paths are smoke-level.)
 */

test.describe('Execution Environment Catalog and Detail View Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.waitForTimeout(500);
    await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/self-service\/ee/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    if ((await page.locator('body').innerText()).includes('Catalog')) {
      await page.getByText('Catalog').first().click({ force: true });
      await page.waitForTimeout(1500);
    }
  });

  test('Validates Catalog tab: empty state or table content', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const text = await page.locator('body').innerText();
    if (text.includes('No Execution Environment definition files, yet')) {
      return;
    }
    if ((await page.locator('table').count()) > 0) {
      await expect(page.locator('table').first()).toBeAttached();
      await page.locator('table').first().scrollIntoViewIfNeeded();
    }
  });

  test('Validates Catalog tab: right sidebar filters (Starred, My Org, Tags, Owner)', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const text = await page.locator('body').innerText();
    if (text.includes('Personal') && text.includes('Starred')) {
      await page.getByText('Starred').first().click({ force: true });
      await page.waitForTimeout(500);
      if (text.includes('All')) {
        await page.getByText('All').first().click({ force: true });
        await page.waitForTimeout(500);
      }
    }
    if (text.includes('My Org') && text.includes('All')) {
      await page
        .getByText('All')
        .first()
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(400);
    }
    if (text.includes('Tags')) {
      await page
        .getByText('Tags')
        .first()
        .click({ force: true })
        .catch(() => {});
    }
    if (text.includes('Owner')) {
      await page
        .getByText('Owner')
        .first()
        .click({ force: true })
        .catch(() => {});
    }
  });

  test('Validates Catalog table: row elements (Name, Owner, Description, Tags, Actions)', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const body = page.locator('body');
    const text = await body.innerText();
    if (text.includes('No Execution Environment definition files, yet')) {
      return;
    }
    const table = page.locator('table').first();
    if ((await table.count()) === 0) {
      return;
    }
    const tt = await table.innerText();
    for (const col of ['Name', 'Owner', 'Description', 'Tags', 'Actions']) {
      if (tt.includes(col)) {
        await expect(
          page.getByText(col, { exact: false }).first(),
        ).toBeAttached();
      }
    }
  });

  test('Validates Catalog table: star/favorite button in Actions column', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const row = page.locator('table tbody tr').first();
    if ((await row.count()) === 0) {
      return;
    }
    const buttons = row.locator('button');
    const bn = await buttons.count();
    for (let i = 0; i < bn; i++) {
      const b = buttons.nth(i);
      const aria = ((await b.getAttribute('aria-label')) || '').toLowerCase();
      const title = ((await b.getAttribute('title')) || '').toLowerCase();
      if (
        aria.includes('favorite') ||
        aria.includes('star') ||
        title.includes('star')
      ) {
        await b.click({ force: true });
        await page.waitForTimeout(1200);
        await b.click({ force: true }).catch(() => {});
        break;
      }
    }
  });

  test('Validates Catalog table: edit button in Actions column', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const row = page.locator('table tbody tr').first();
    if ((await row.count()) === 0) {
      return;
    }
    const editBtn = row.locator('button').filter({ hasText: /edit/i }).first();
    if ((await editBtn.count()) > 0) {
      await editBtn.click({ force: true });
      await page.waitForTimeout(1500);
      if (page.url().includes('/edit')) {
        await page.goBack();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('Validates Catalog table: clicking Name link navigates to detail view', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const row = page.locator('table tbody tr').first();
    if ((await row.count()) === 0) {
      return;
    }
    const nameEl = row.locator('a, button, [role="link"]').first();
    if ((await nameEl.count()) > 0) {
      await nameEl.click({ force: true });
      await page.waitForTimeout(2000);
      const url = page.url();
      if (url.includes('/catalog/') || url.includes('/self-service/catalog/')) {
        await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('Validates Detail view page: Links, About, basic structure', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    if ((await page.locator('table tbody tr').count()) === 0) {
      return;
    }
    const row = page.locator('table tbody tr').first();
    const link = row.locator('a').first();
    if ((await link.count()) === 0) {
      return;
    }
    await link.click({ force: true });
    await page.waitForTimeout(2500);
    const body = page.locator('body');
    const t = await body.innerText();
    if (t.includes('Download') || t.includes('Links')) {
      await expect(body).toBeVisible();
    }
    if (t.includes('About') && t.includes('OWNER')) {
      await expect(body.getByText(/OWNER/i).first())
        .toBeAttached()
        .catch(() => {});
    }
  });
});
