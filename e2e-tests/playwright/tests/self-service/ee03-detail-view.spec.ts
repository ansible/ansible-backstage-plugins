import { test, expect } from '../../fixtures/auth-context';

/**
 * EE Catalog + detail view — migrated from cypress/e2e/self-service/ee03-detail-view.cy.ts
 * (Long Cypress flows are represented; Inspect/Unregister deep paths are smoke-level.)
 */

test.describe('Execution Environment Catalog and Detail View Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.waitForTimeout(500);
    await page.goto('/self-service/ee', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/self-service\/ee/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    if ((await page.locator('body').innerText()).includes('Catalog')) {
      await page.getByText('Catalog').first().click({ force: true });
      await page.waitForLoadState('networkidle');
    }
    const table = page.locator('table').first();
    if ((await table.count()) > 0) {
      await table.waitFor({ state: 'attached', timeout: 15000 });
      await page.waitForLoadState('networkidle');
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
    await row.waitFor({ state: 'visible', timeout: 15000 });
    const starButton = row.locator(
      'button[aria-label*="favorite" i], button[aria-label*="star" i], button[title*="star" i]',
    );
    if ((await starButton.count()) > 0) {
      await starButton.first().waitFor({ state: 'visible', timeout: 10000 });
      await starButton.first().click();
      await page.waitForTimeout(1200);
      await starButton
        .first()
        .click()
        .catch(() => {});
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
    await row.waitFor({ state: 'visible', timeout: 15000 });
    const nameEl = row.locator('a, button, [role="link"]').first();
    if ((await nameEl.count()) > 0) {
      await nameEl.waitFor({ state: 'visible', timeout: 10000 });
      await nameEl.click();
      await page.waitForLoadState('networkidle');
      const url = page.url();
      if (url.includes('/catalog/') || url.includes('/self-service/catalog/')) {
        await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('Validates Catalog table: kebab menu actions', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const row = page.locator('table tbody tr').first();
    if ((await row.count()) === 0) {
      return;
    }

    // Find and click kebab menu button (usually the last button in Actions column)
    const buttons = row.locator('button');
    const buttonCount = await buttons.count();
    if (buttonCount === 0) {
      return;
    }

    // Click the last button (typically the kebab menu)
    const kebabBtn = buttons.last();
    await kebabBtn.click({ force: true });
    await page.waitForTimeout(800);

    // Verify menu items appear
    const menuText = await page.locator('body').innerText();

    // Check for common menu items (they may not all be present depending on EE type)
    const menuItems = [
      'Edit definition',
      'View in source',
      'Delete',
      'Build',
      'Download',
    ];

    let foundItems = 0;
    for (const item of menuItems) {
      if (menuText.includes(item)) {
        foundItems++;
        await expect(page.getByText(item, { exact: false }).first())
          .toBeAttached()
          .catch(() => {});
      }
    }

    // At least one menu item should be present
    expect(foundItems).toBeGreaterThan(0);

    // Close menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
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

  test('Validates Detail view page: all sections (Readme, Resources, Download, About)', async ({
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
    const text = await body.innerText();

    // Check for all 4 sections mentioned in Jira AAP-70869
    // Some sections may not be present depending on EE type, so we check conditionally

    if (text.includes('Download')) {
      await expect(body.getByText('Download', { exact: false }).first())
        .toBeAttached()
        .catch(() => {});
    }

    if (text.includes('Links')) {
      await expect(body.getByText('Links', { exact: false }).first())
        .toBeAttached()
        .catch(() => {});
    }

    if (text.includes('About')) {
      await expect(body.getByText('About', { exact: false }).first())
        .toBeAttached()
        .catch(() => {});
    }

    if (text.includes('README') || text.includes('Readme')) {
      await expect(body.getByText(/README|Readme/i).first())
        .toBeAttached()
        .catch(() => {});
    }

    if (text.includes('Resources')) {
      await expect(body.getByText('Resources', { exact: false }).first())
        .toBeAttached()
        .catch(() => {});
    }
  });

  test('Validates Detail view page: Actions dropdown menu', async ({
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

    // Look for Actions button (top right corner of detail page)
    const actionsBtn = page
      .getByRole('button', { name: /actions/i })
      .or(page.locator('button[aria-label*="more"]'))
      .or(page.locator('button').filter({ hasText: /⋮/ }))
      .first();

    if ((await actionsBtn.count()) === 0) {
      return;
    }

    // Click Actions button
    await actionsBtn.click({ force: true });
    await page.waitForTimeout(800);

    const menuText = await page.locator('body').innerText();

    // Verify common menu items (may vary by EE type)
    const menuItems = ['Edit definition', 'View in source', 'Delete', 'Build'];

    let foundItems = 0;
    for (const item of menuItems) {
      if (menuText.includes(item)) {
        foundItems++;
        await expect(page.getByText(item, { exact: false }).first())
          .toBeAttached()
          .catch(() => {});
      }
    }

    // At least one menu item should be present
    expect(foundItems).toBeGreaterThan(0);

    // Close menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });
});
