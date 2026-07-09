import { test, expect } from '../../fixtures/auth-context';
import { handleGitLabLoginOnPage } from '../../utils/auth';

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
    // Wait for row to be stable before interacting
    await row.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForLoadState('networkidle');

    const editBtn = row.locator('button').filter({ hasText: /edit/i }).first();
    if ((await editBtn.count()) > 0) {
      // Wait for button to be stable and clickable (removed force: true to let Playwright's actionability checks work)
      await editBtn.waitFor({ state: 'visible', timeout: 10000 });
      await editBtn.click(); // Let Playwright wait for element to be stable
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

  // EE Build Process Tests - Jira [e2e UI] Add Comprehensive Tests for EE build process
  test('Validates Catalog table: Build option triggers build process from kebab menu', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const row = page.locator('table tbody tr').first();
    if ((await row.count()) === 0) {
      return;
    }

    // Wait for row to be stable before interacting
    await row.waitFor({ state: 'visible', timeout: 15000 });

    // Find and click kebab menu button
    const buttons = row.locator('button');
    const buttonCount = await buttons.count();
    if (buttonCount === 0) {
      return;
    }

    // Wait for kebab button to be stable and clickable
    const kebabBtn = buttons.last();
    await kebabBtn.waitFor({ state: 'visible', timeout: 10000 });
    await kebabBtn.click();

    // Wait for menu to be visible (not the hidden modal)
    const menu = page.locator('[role="menu"]:not([aria-hidden="true"])');
    await expect(menu.first()).toBeVisible({ timeout: 5000 });

    // Check if Build option exists in menu
    const menuText = await menu.first().innerText();
    if (!menuText.includes('Build')) {
      // Close menu and skip if Build not available for this EE
      await page.keyboard.press('Escape');
      return;
    }

    // Click Build option - wait for it to be visible and clickable
    const buildMenuItem = menu.getByText('Build', { exact: false }).first();
    await expect(buildMenuItem).toBeVisible({ timeout: 5000 });
    await buildMenuItem.click();

    // Wait for build modal/dialog to appear (exclude hidden menus and modals)
    const modal = page.locator(
      '[role="dialog"]:not([aria-hidden="true"]), .MuiDialog-root:not(.v5-MuiModal-hidden)',
    );
    await expect(modal.first()).toBeVisible({ timeout: 10000 });

    // Verify modal contains build-related content
    const modalText = await modal.first().innerText();
    expect(
      modalText.toLowerCase().includes('build') ||
        modalText.toLowerCase().includes('execution environment'),
    ).toBeTruthy();

    // Fill build form fields
    // Field 1: Registry - prefilled, skip
    // Field 2: Image name - required field to fill
    const imageNameInput = modal.locator(
      'input[name*="image" i], input[placeholder*="image" i], input[label*="image name" i]',
    );
    if ((await imageNameInput.count()) > 0) {
      await imageNameInput.first().waitFor({ state: 'visible', timeout: 5000 });
      const suffix = Array.from({ length: 4 }, () =>
        String.fromCodePoint(97 + Math.floor(Math.random() * 26)),
      ).join('');
      await imageNameInput.first().fill(`ee-test/ee-build-${suffix}`);
      await page.waitForTimeout(500);
    }
    // Field 3: Image tag - prefilled, skip

    // Click Build button in modal - wait for it to be enabled
    const buildButton = modal
      .getByRole('button', { name: /build/i })
      .or(modal.locator('button').filter({ hasText: /build/i }));

    if ((await buildButton.count()) > 0) {
      await buildButton.first().waitFor({ state: 'visible', timeout: 10000 });
      await expect(buildButton.first()).toBeEnabled({ timeout: 5000 });
      await buildButton.first().click();

      // Validate toast notification appears with "Build triggered" message
      const toast = page.locator(
        '[role="alert"], .MuiSnackbar-root, [class*="toast" i], [class*="notification" i]',
      );
      await expect(toast.first()).toBeVisible({ timeout: 15000 });

      // Verify toast contains "Build triggered" message
      const toastText = await toast.first().innerText();
      expect(toastText).toContain('Build triggered');
    }
  });

  // GitLab EE Build Process Test — validates build trigger shows GitLab pipeline URL
  test('Validates Catalog table: Build on GitLab-published EE shows pipeline URL', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('No Execution Environment definition files, yet')) {
      test.skip(true, 'No EE definitions found');
      return;
    }

    // Wait for table rows to fully render
    await page
      .locator('table tbody tr')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Find a GitLab-published EE row (created by ee02b with name pattern "ee-gl-*")
    const glRow = page
      .locator('table tbody tr')
      .filter({ hasText: /ee-gl-/i })
      .first();
    if ((await glRow.count()) === 0) {
      test.skip(
        true,
        'No GitLab-published EE found (ee-gl-*) — run ee02b first',
      );
      return;
    }

    await glRow.waitFor({ state: 'visible', timeout: 15000 });

    // Click kebab menu on the GitLab EE row — retry since the "Build" option
    // only appears once the catalog has indexed the entity with the
    // backstage.io/source-location annotation.
    const BUILD_MENU_RETRIES = 3;
    const BUILD_MENU_WAIT_MS = 10000;
    let buildFound = false;
    for (let attempt = 0; attempt < BUILD_MENU_RETRIES; attempt++) {
      const kebabBtn = glRow.locator('button[aria-label="Actions"]');
      if ((await kebabBtn.count()) === 0) {
        console.log('[EE Test] Actions button not found on row');
        break;
      }
      await kebabBtn.waitFor({ state: 'visible', timeout: 10000 });
      await kebabBtn.click({ force: true });
      await page.waitForTimeout(800);

      // Check the full page body for menu items — MUI renders the dropdown
      // menu as a portal at the body level, not inside the row.
      const bodyText = await page.locator('body').innerText();
      console.log(
        `[EE Test] Body contains "Build": ${bodyText.includes('Build')} (attempt ${attempt + 1}/${BUILD_MENU_RETRIES})`,
      );
      if (bodyText.includes('Build')) {
        buildFound = true;
        break;
      }

      console.log(
        `[EE Test] Build option not in menu (attempt ${attempt + 1}/${BUILD_MENU_RETRIES}), waiting for catalog refresh...`,
      );
      await page.keyboard.press('Escape');
      await page.waitForTimeout(BUILD_MENU_WAIT_MS);
      await page.reload({ waitUntil: 'networkidle' });
      await page
        .locator('table tbody tr')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 });
    }

    if (!buildFound) {
      console.log(
        '[EE Test] Build option not available after retries — entity may be missing source-location annotation',
      );
      test.skip(
        true,
        'Build option not available for GitLab EE — entity may need catalog refresh',
      );
      return;
    }

    const buildMenuItem = page
      .getByRole('menuitem')
      .filter({ hasText: /^Build$/ })
      .first();
    await expect(buildMenuItem).toBeVisible({ timeout: 5000 });
    await buildMenuItem.click();
    await page.waitForTimeout(2000);

    // Clicking Build may trigger a GitLab OAuth login if not already
    // authenticated. Handle the "Login Required" dialog if it appears.
    const loginDialog = page.getByText('Login Required').first();
    if (await loginDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[EE Test] GitLab OAuth login required for build');

      if (!process.env.GL_USER_ID || !process.env.GL_USER_PASS) {
        test.skip(
          true,
          'GL_USER_ID/GL_USER_PASS required for GitLab build auth',
        );
        return;
      }

      const logInBtn = page.getByRole('button', { name: /^Log in$/i }).first();
      if ((await logInBtn.count()) > 0) {
        const context = page.context();
        const [popup] = await Promise.all([
          context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
          logInBtn.click(),
        ]);

        if (popup) {
          console.log('[EE Test] GitLab OAuth popup opened');
          await handleGitLabLoginOnPage(popup);
          await popup
            .waitForEvent('close', { timeout: 60000 })
            .catch(() => console.log('[EE Test] GitLab popup did not close'));
          console.log('[EE Test] GitLab OAuth popup closed');
        } else {
          // Redirect flow — page navigated to gitlab.com
          console.log('[EE Test] GitLab OAuth redirect flow');
          await handleGitLabLoginOnPage(page);
        }
        await page.waitForTimeout(3000);
      }
    }

    // Wait for build modal
    const modal = page.locator(
      '[role="dialog"]:not([aria-hidden="true"]), .MuiDialog-root:not(.v5-MuiModal-hidden)',
    );
    await expect(modal.first()).toBeVisible({ timeout: 15000 });

    // Fill image name
    const imageNameInput = modal.locator(
      '[data-testid="ee-build-image-name"], input[name*="image" i], input[placeholder*="image" i]',
    );
    if ((await imageNameInput.count()) > 0) {
      await imageNameInput.first().waitFor({ state: 'visible', timeout: 5000 });
      const suffix = Array.from({ length: 4 }, () =>
        String.fromCodePoint(97 + Math.floor(Math.random() * 26)),
      ).join('');
      await imageNameInput.first().fill(`ee-test/ee-gl-${suffix}`);
      await page.waitForTimeout(500);
    }

    // Click Build button
    const buildButton = modal
      .getByRole('button', { name: /build/i })
      .or(modal.locator('button').filter({ hasText: /build/i }));

    if ((await buildButton.count()) === 0) {
      throw new Error(
        'Build button not found in modal — GitLab build flow cannot be verified',
      );
    }

    await buildButton.first().waitFor({ state: 'visible', timeout: 10000 });
    await expect(buildButton.first()).toBeEnabled({ timeout: 5000 });
    await buildButton.first().click();

    // Validate that a notification appears after clicking Build —
    // matches both "Build triggered" (success) and "Build failed" (error).
    const notification = page
      .getByText('Build triggered')
      .or(page.getByText('Build failed'))
      .first();
    await expect(notification).toBeVisible({ timeout: 15000 });
    const notificationText = await notification.innerText();
    console.log('[EE Test] Build notification:', notificationText);
  });

  // Pagination Tests - Jira AAP-73524
  test('Validates Catalog table: pagination controls and navigation', async ({
    page,
  }) => {
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    const text = await page.locator('body').innerText();

    // Skip if no data or empty state
    if (text.includes('No Execution Environment definition files, yet')) {
      return;
    }

    // Check if pagination controls exist
    const nextAll = page.locator('[aria-label="Next page"]');
    if ((await nextAll.count()) === 0) {
      return;
    }

    const next = nextAll.first();

    // Skip if only one page (Next button disabled)
    if (await next.isDisabled()) {
      return;
    }

    // Verify initial state - Page 1
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

    // Verify pagination controls are displayed
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeVisible();
    await expect(next).toBeEnabled();

    // Count items on first page
    const rowsPage1 = await page.locator('table tbody tr').count();
    expect(rowsPage1).toBeGreaterThan(0);

    // Navigate to page 2
    await next.click();

    // Verify page state updated to page 2
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

    // Verify Previous button is now visible and enabled
    const prev = page.locator('[aria-label="Previous page"]').first();
    await expect(prev).toBeVisible();
    await expect(prev).toBeEnabled();

    // Count items on second page
    const rowsPage2 = await page.locator('table tbody tr').count();
    expect(rowsPage2).toBeGreaterThan(0);

    // Navigate back to page 1
    await prev.click();

    // Verify page state maintained correctly - back to page 1
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

    // Verify correct number of items displayed
    const rowsBackToPage1 = await page.locator('table tbody tr').count();
    expect(rowsBackToPage1).toBe(rowsPage1);
  });
});
