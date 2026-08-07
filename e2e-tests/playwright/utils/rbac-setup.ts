import { chromium, Page } from '@playwright/test';

const DEFAULT_ROLE_NAME = 'portal-nonadmin-role';
const ROLE_DESCRIPTION =
  'E2E test role with all plugin permissions for non-admin user';
const MAX_CHECKBOX_ITERATIONS = 50;
const SENSITIVE_ENV_KEYS = [
  'AAP_TOKEN',
  'AAP_NONADMIN_USER_ID',
  'AAP_USER_PASS',
  'AAP_NONADMIN_USER_PASS',
];

function redact(msg: string): string {
  let sanitized = msg;
  for (const key of SENSITIVE_ENV_KEYS) {
    const val = process.env[key];
    if (val) sanitized = sanitized.split(val).join(`[${key}]`);
  }
  return sanitized;
}

function log(msg: string) {
  console.log(`[RBAC Setup] ${redact(msg)}`);
}

async function isElementVisible(
  locator: ReturnType<Page['locator']>,
  timeout: number,
): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function loginAsAdmin(page: Page) {
  log('Navigating to login page...');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const onLoginPage = await page
    .getByText('Log in to your account')
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!onLoginPage) {
    const signIn = page.getByRole('button', { name: /Sign In/i }).first();
    if (await signIn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await signIn.click();
      await page.waitForLoadState('domcontentloaded');
    }
    await page
      .getByText('Log in to your account')
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  log('Filling admin credentials...');
  await page.locator('#pf-login-username-id').fill(process.env.AAP_USER_ID!);
  await page.locator('#pf-login-password-id').fill(process.env.AAP_USER_PASS!);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForLoadState('domcontentloaded');

  const authorizeVisible = await page
    .getByText(/Authorize.*\?/)
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (authorizeVisible) {
    log('OAuth authorize page detected, clicking Authorize...');
    await page.getByRole('button', { name: 'Authorize' }).click();
    await page.waitForLoadState('domcontentloaded');
  }

  await page.waitForTimeout(3000);
  await page.locator('main').waitFor({ state: 'visible', timeout: 30_000 });
  log(`Admin login complete, URL: ${page.url()}`);
}

async function createNonAdminUserViaUI(page: Page) {
  const username = process.env.AAP_NONADMIN_USER_ID!;
  const password = process.env.AAP_NONADMIN_USER_PASS!;
  const orgName = process.env.AAP_ORG_NAME || 'Default';

  log('Navigating to Access Management > Users...');
  await page.goto('/access/users', { waitUntil: 'domcontentloaded' });
  await page.locator('main').waitFor({ state: 'visible', timeout: 30_000 });

  const searchInput = page
    .getByPlaceholder(/search/i)
    .or(page.locator('input[aria-label*="Search"]'))
    .first();
  const hasSearch = await isElementVisible(searchInput, 5_000);
  if (hasSearch) {
    await searchInput.fill(username);
    await page.waitForTimeout(2_000);
  }

  const existingUser = page
    .locator('table')
    .getByText(username, { exact: true });
  const userExists = await isElementVisible(existingUser, 5_000);

  if (userExists) {
    log(`User "${username}" already exists, skipping creation`);
    return;
  }

  if (hasSearch) {
    await searchInput.clear();
    await page.waitForTimeout(1_000);
  }

  log('Clicking Create user...');
  const createUserBtn = page
    .locator('a, button')
    .filter({ hasText: /Create user/i })
    .first();
  await createUserBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await createUserBtn.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);

  log('Filling user details...');

  const usernameField = page.getByPlaceholder('Enter username').or(
    page.locator('input').first(),
  ).first();
  await usernameField.waitFor({ state: 'visible', timeout: 10_000 });
  await usernameField.fill(username);

  const passwordFields = page.locator('input[type="password"]');
  await passwordFields.first().waitFor({ state: 'visible', timeout: 10_000 });
  await passwordFields.nth(0).fill(password);
  log('Filled password');

  await passwordFields.nth(1).fill(password);
  log('Filled confirm password');

  log('Selecting organization...');
  const orgDropdown = page.getByPlaceholder('Select organizations').or(
    page.locator('button, input').filter({ hasText: /Select organizations/i }),
  ).first();
  await orgDropdown.click();
  await page.waitForTimeout(1_000);
  const orgOption = page
    .getByRole('option', { name: orgName })
    .or(page.locator('li, [role="menuitem"]').filter({ hasText: orgName }))
    .first();
  await orgOption.waitFor({ state: 'visible', timeout: 5_000 });
  await orgOption.click();
  log(`Selected organization: ${orgName}`);

  log('Submitting user creation...');
  await page
    .locator('button')
    .filter({ hasText: /^Create user$/i })
    .last()
    .click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3_000);

  log(`Non-admin user "${username}" created via UI`);
}

async function triggerCatalogSync(page: Page) {
  log('Navigating to Templates page for sync...');
  await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3_000);
  await page
    .getByText('Templates')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  log('Templates page loaded');

  const syncLink = page
    .locator('span')
    .filter({ hasText: /^Sync now/ })
    .first();
  const syncVisible = await isElementVisible(syncLink, 20_000);

  if (!syncVisible) {
    log('Sync now not found, trying API fallback...');
    const res = await page.request.post(
      '/api/catalog/ansible/sync/from-aap/orgs_users_teams',
    );
    const status = res.status();
    log(`Sync API fallback: ${status}`);
    if (status < 200 || status >= 300) {
      throw new Error(
        `Catalog sync API returned non-success status: ${status}`,
      );
    }
    await page.waitForTimeout(10_000);
    return;
  }

  await syncLink.click();
  log('Clicked Sync now, waiting for dialog...');

  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  log('Sync dialog opened');

  const orgsCheckbox = dialog.getByRole('checkbox', {
    name: /Organizations, Users, and Teams/i,
  });
  if (!(await orgsCheckbox.isChecked())) {
    await orgsCheckbox.check();
  }

  await dialog.getByRole('button', { name: 'Ok' }).click();
  log('Sync triggered, waiting for completion...');

  await page.waitForTimeout(10_000);
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

  const searchInput = page.getByPlaceholder(/search/i);
  const hasSearch = await isElementVisible(searchInput, 3_000);
  if (hasSearch) {
    await searchInput.fill(roleName);
    await page.waitForTimeout(1_000);
  }

  const existingRole = page
    .locator('table')
    .getByText(roleName, { exact: true });
  const roleExists = await isElementVisible(existingRole, 5_000);

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

  const descField = page.getByTestId('role-description').locator('input');
  const hasDesc = await isElementVisible(descField, 2_000);
  if (hasDesc) {
    await descField.fill(ROLE_DESCRIPTION);
  }

  await page.getByTestId('nextButton-0').click();
  log('Step 1 complete, clicked Next');

  // Step 2: Users and Groups
  log('Step 2: Selecting configured non-admin user...');
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

  const optionVisible = await isElementVisible(userOption, 10_000);

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
    .filter({ hasText: /^All plugins/ })
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

    const maxIterations = MAX_CHECKBOX_ITERATIONS;
    let checked = 0;
    while (uncheckedCount > 0 && checked < maxIterations) {
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

  const createSubmitButton = page.getByRole('button', {
    name: 'Create',
    exact: true,
  });
  await createSubmitButton.waitFor({ state: 'visible', timeout: 10_000 });
  await createSubmitButton.click();
  log('Clicked Create button');

  await page.waitForURL(/\/rbac(?!\/role\/new)/, { timeout: 15_000 });

  const errorAlert = page.locator('[class*="MuiAlert-standardError"]');
  const hasError = await isElementVisible(errorAlert, 3_000);

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

  const aapURL = process.env.AAP_URL || 'https://localhost';
  const portalURL = process.env.BASE_URL || 'http://localhost:7007';
  log(`Starting RBAC setup: AAP=${aapURL}, Portal=${portalURL}`);

  const browser = await chromium.launch({ channel: 'chrome' });

  const aapContext = await browser.newContext({
    baseURL: aapURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });
  const aapPage = await aapContext.newPage();

  try {
    await loginAsAdmin(aapPage);
    await createNonAdminUserViaUI(aapPage);
    await aapPage.close();
    await aapContext.close();

    const portalContext = await browser.newContext({
      baseURL: portalURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 },
    });
    const page = await portalContext.newPage();

    log('Logging in to Portal as admin...');
    await loginAsAdmin(page);

    try {
      await triggerCatalogSync(page);
    } catch (error) {
      log(`Sync failed (non-fatal): ${(error as Error).message}`);
    }

    await createRBACRole(page);
    log('RBAC setup complete');
    await page.close();
    await portalContext.close();
  } finally {
    await browser.close();
  }
}
