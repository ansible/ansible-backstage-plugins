import { test, expect } from '../../fixtures/auth-context';
import {
  getBackstageToken,
  catalogFetch,
  discoverOrgNamespaces,
} from '../../utils/backstage-api';

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
 * Requires: rhdh-local running with multi-org config
 * Auth: AAP OAuth via shared auth-context fixture
 */

const ADMIN_USERNAME = process.env.AAP_USER_ID || 'admin';

test('Multi-Org UI: admin user entity page', async ({ page }) => {
  const token = await getBackstageToken(page);
  const orgNamespaces = await discoverOrgNamespaces(page, token);
  expect(
    orgNamespaces.length,
    'Should discover at least one org namespace',
  ).toBeGreaterThan(0);

  const nonDefaultOrgs = orgNamespaces.filter(ns => ns !== 'default');
  expect(
    nonDefaultOrgs.length,
    'Should have at least one non-default org',
  ).toBeGreaterThan(0);

  await page.goto(`/catalog/default/user/${ADMIN_USERNAME}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByTitle(`user:default/${ADMIN_USERNAME}`)).toBeVisible();

  await expect(
    page.getByRole('link', { name: 'AAP Administrators' }),
  ).toBeVisible({ timeout: 15000 });

  const mainContent = page.locator('main');
  await expect(mainContent.getByText(/\[Default\]/i).first()).toBeVisible({
    timeout: 10000,
  });

  // Verify at least one non-default org appears in team memberships
  const orgDisplayNames: string[] = [];
  for (const ns of nonDefaultOrgs) {
    const orgResult = await catalogFetch(
      page,
      `/entities/by-name/group/${ns}/${ns}`,
      token,
    );
    if (orgResult.ok) {
      const displayName =
        orgResult.body.spec?.profile?.displayName ??
        orgResult.body.metadata?.name;
      if (displayName) orgDisplayNames.push(displayName);
    }
  }

  let foundNonDefaultOrg = false;
  for (const name of orgDisplayNames) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = await mainContent
      .getByText(new RegExp(`\\[${escapedName}\\]`, 'i'))
      .count();
    if (count > 0) {
      foundNonDefaultOrg = true;
      break;
    }
  }
  expect(
    foundNonDefaultOrg,
    `Should show team from a non-default org. Checked: ${orgDisplayNames.join(
      ', ',
    )}`,
  ).toBe(true);
});

test('Multi-Org UI: org group entity pages', async ({ page }) => {
  const token = await getBackstageToken(page);
  const orgNamespaces = await discoverOrgNamespaces(page, token);
  expect(orgNamespaces.length).toBeGreaterThan(0);

  for (const orgSlug of orgNamespaces) {
    await page.goto(`/catalog/${orgSlug}/group/${orgSlug}`, {
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
  const token = await getBackstageToken(page);
  const orgNamespaces = await discoverOrgNamespaces(page, token);
  expect(orgNamespaces.length).toBeGreaterThan(0);

  await page.goto('/catalog?filters[kind]=group&filters[type]=organization', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  await expect(page.locator('main')).toBeVisible();

  const tableOrList = page.locator('main');
  for (const orgSlug of orgNamespaces) {
    const orgPattern = new RegExp(orgSlug, 'i');
    await expect(tableOrList.getByText(orgPattern).first()).toBeVisible({
      timeout: 15000,
    });
  }
});
