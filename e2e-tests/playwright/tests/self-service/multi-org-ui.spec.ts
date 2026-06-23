import { test, expect } from '../../fixtures/auth-context';

/**
 * Multi-Org UI Tests
 *
 * Verifies that the Portal UI correctly displays multi-org information:
 * - Admin user entity page shows group memberships
 * - Org group entity pages load and display type
 * - Org groups are browsable in the catalog
 *
 * Consolidated into fewer tests to minimise repeated OAuth logins.
 *
 * Requires: rhdh-local running with multi-org config (orgs: [Default, 11-org])
 * Auth: AAP OAuth via shared auth-context fixture
 */

const ADMIN_USERNAME = process.env.AAP_USER_ID || 'admin';

test('Multi-Org UI: admin user entity page', async ({ page }) => {
  await page.goto(`/catalog/default/user/${ADMIN_USERNAME}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  // Page renders with the admin user entity
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByTitle(`user:default/${ADMIN_USERNAME}`)).toBeVisible();

  // Shows AAP Administrators group (display name for aap-admins)
  await expect(
    page.getByRole('link', { name: 'AAP Administrators' }),
  ).toBeVisible({ timeout: 15000 });

  // Shows team memberships from both org namespaces
  // Backstage renders these as "teamName [orgDisplayName]"
  const mainContent = page.locator('main');
  await expect(mainContent.getByText(/\[Default\]/i).first()).toBeVisible({
    timeout: 10000,
  });
  await expect(mainContent.getByText(/\[11-org\]/i).first()).toBeVisible({
    timeout: 10000,
  });
});

test('Multi-Org UI: org group entity pages', async ({ page }) => {
  for (const orgSlug of ['aap-default', '11org']) {
    await page.goto(`/catalog/default/group/${orgSlug}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('organization', { exact: true })).toBeVisible({
      timeout: 15000,
    });
  }
});

test('Multi-Org UI: catalog lists org group entities', async ({ page }) => {
  await page.goto('/catalog?filters[kind]=group&filters[type]=organization', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  await expect(page.locator('main')).toBeVisible();

  const tableOrList = page.locator('main');
  await expect(
    tableOrList.getByText(/aap-default|Default/i).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(tableOrList.getByText(/11org|11-org/i).first()).toBeVisible({
    timeout: 15000,
  });
});
