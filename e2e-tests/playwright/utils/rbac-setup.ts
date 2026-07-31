import { chromium, Page } from '@playwright/test';
import { loginAAP } from './auth';

const DEFAULT_ROLE_NAME = 'portal-nonadmin-role';
const ROLE_DESCRIPTION =
  'E2E test role with all plugin permissions for non-admin user';

function log(msg: string) {
  console.log(`[RBAC Setup] ${msg}`);
}

async function triggerCatalogSync(page: Page) {
  log('Navigating to Templates page for sync...');
  await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });
  await page.locator('main').waitFor({ state: 'visible', timeout: 30_000 });

  const syncLink = page.getByText('Sync now');
  const syncVisible = await syncLink
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (!syncVisible) {
    log('Sync now link not found, skipping sync');
    return;
  }

  await syncLink.click();
  log('Clicked Sync now, waiting for dialog...');

  await page
    .getByText('AAP synchronization options')
    .waitFor({ state: 'visible', timeout: 10_000 });

  const orgsCheckbox = page.locator('input[name="orgsUsersTeams"]');
  if (!(await orgsCheckbox.isChecked())) {
    await orgsCheckbox.check();
  }

  await page.getByRole('button', { name: 'Ok' }).click();
  log('Sync triggered, waiting for completion...');

  await page.waitForTimeout(5_000);
  log('Catalog sync complete');
}

async function createRBACRole(page: Page) {
  const userId = process.env.AAP_NONADMIN_USER_ID;
  if (!userId) {
    log('AAP_NONADMIN_USER_ID not set, skipping RBAC role creation');
    return;
  }

  const roleName = process.env.RBAC_ROLE_NAME || DEFAULT_ROLE_NAME;

  log('Navigating to RBAC page...');
  await page.goto('/rbac', { waitUntil: 'domcontentloaded' });
  await page.locator('main').waitFor({ state: 'visible', timeout: 30_000 });

  const existingRole = page
    .locator('table')
    .getByText(roleName, { exact: true });
  const roleExists = await existingRole
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  if (roleExists) {
    log(`Role "${roleName}" already exists, skipping creation`);
    return;
  }

  const createButton = page.getByTestId('create-role');
  await createButton.waitFor({ state: 'visible', timeout: 15_000 });
  await createButton.click();
  log('Clicked Create role button');

  // Step 1: Role Details
  log('Step 1: Filling role details...');
  await page
    .getByTestId('role-name')
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('role-name').locator('input').fill(roleName);
  await page
    .getByTestId('role-description')
    .locator('input')
    .fill(ROLE_DESCRIPTION);

  await page.getByTestId('nextButton-0').click();
  log('Step 1 complete, clicked Next');

  // Step 2: Users and Groups
  log(`Step 2: Selecting user "${userId}"...`);
  const userTextField = page
    .getByTestId('users-and-groups-text-field')
    .locator('input');
  await userTextField.waitFor({ state: 'visible', timeout: 10_000 });
  await userTextField.click();
  await userTextField.fill(userId);

  const listbox = page.getByRole('listbox');
  await listbox.waitFor({ state: 'visible', timeout: 15_000 });

  const userOption = page
    .getByRole('option')
    .filter({ hasText: userId })
    .first();

  const optionVisible = await userOption
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (!optionVisible) {
    throw new Error(
      `User "${userId}" not found in autocomplete. Ensure catalog sync completed and the user exists.`,
    );
  }

  await userOption.click();
  log(`Selected user "${userId}"`);

  await page.getByTestId('nextButton-1').click();
  log('Step 2 complete, clicked Next');

  // Step 3: Permission Policies
  log('Step 3: Selecting plugins and permissions...');

  const pluginsInput = page.getByLabel(/Select plugins/i);
  await pluginsInput.waitFor({ state: 'visible', timeout: 15_000 });
  await pluginsInput.click();

  const pluginsListbox = page.getByRole('listbox');
  await pluginsListbox.waitFor({ state: 'visible', timeout: 10_000 });

  const allPluginsOption = page
    .getByRole('option')
    .filter({ hasText: /all/i })
    .first();
  await allPluginsOption.click();
  log('Selected "All plugins" option');

  await page
    .locator('[data-testid^="expand-row-"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });

  const expandButtons = await page
    .locator('[data-testid^="expand-row-"]')
    .all();

  if (expandButtons.length === 0) {
    throw new Error('No plugin rows found after selecting All plugins');
  }

  log(`Found ${expandButtons.length} plugin rows to expand`);

  for (const expandBtn of expandButtons) {
    const testId = await expandBtn.getAttribute('data-testid');
    const pluginName = testId?.replace('expand-row-', '') ?? 'unknown';

    await expandBtn.click();
    log(`Expanded plugin: ${pluginName}`);

    const nestedRow = page.getByTestId(`nested-row-${pluginName}`);
    await nestedRow.waitFor({ state: 'visible', timeout: 5_000 });

    let uncheckedCount = await nestedRow
      .locator('input[type="checkbox"]:not(:checked)')
      .count();

    let checked = 0;
    while (uncheckedCount > 0) {
      const checkbox = nestedRow
        .locator('input[type="checkbox"]:not(:checked)')
        .first();
      await checkbox.check();
      checked++;
      uncheckedCount = await nestedRow
        .locator('input[type="checkbox"]:not(:checked)')
        .count();
    }

    log(`  Checked ${checked} permissions in ${pluginName}`);
  }

  await page.getByTestId('nextButton-2').click();
  log('Step 3 complete, clicked Next');

  // Step 4: Review and Create
  log('Step 4: Reviewing and creating role...');

  const createSubmitButton = page.getByRole('button', { name: /Create/i });
  await createSubmitButton.waitFor({ state: 'visible', timeout: 10_000 });
  await createSubmitButton.click();
  log('Clicked Create button');

  await page
    .waitForURL(/\/rbac(?!\/role\/new)/, { timeout: 15_000 })
    .catch(e => log(`Navigation wait timed out: ${(e as Error).message}`));

  const errorAlert = page.locator('[class*="MuiAlert-standardError"]');
  const hasError = await errorAlert
    .isVisible({ timeout: 3_000 })
    .catch(() => false);

  if (hasError) {
    const errorText = (await errorAlert.textContent()) ?? 'Unknown error';
    throw new Error(`RBAC role creation failed: ${errorText}`);
  }

  log(`RBAC role "${roleName}" created successfully`);
}

export async function setupNonAdminRBAC() {
  if (!process.env.AAP_NONADMIN_USER_ID) {
    log('AAP_NONADMIN_USER_ID not set, skipping RBAC setup');
    return;
  }

  const baseURL = process.env.BASE_URL || 'http://localhost:7071';
  log(`Starting RBAC setup against ${baseURL}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    log('Logging in as admin...');
    await loginAAP(page);
    log('Admin login complete');

    try {
      await triggerCatalogSync(page);
    } catch (error) {
      log(`Sync failed (non-fatal): ${(error as Error).message}`);
    }

    await createRBACRole(page);
    log('RBAC setup complete');
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}
