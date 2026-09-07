import { test, expect } from '../../fixtures/auth-context';
import {
  getBackstageToken,
  catalogFetch,
  discoverOrgNamespaces,
} from '../../utils/backstage-api';

/**
 * Multi-Org Catalog API Tests
 *
 * Verifies that the Backstage catalog API reflects correct multi-org
 * entity relationships for a superuser: org group entities, team
 * membership in both org namespaces, and aap-admins group membership.
 *
 * All assertions run in a single test to avoid repeated OAuth logins.
 *
 * Requires: rhdh-local running with multi-org config
 * Auth: AAP OAuth via shared auth-context fixture + Backstage Bearer token
 */

const ADMIN_USERNAME = process.env.AAP_USER_ID || 'admin';

test('Multi-Org Catalog API: superuser entity structure', async ({ page }) => {
  const token = await getBackstageToken(page);
  const orgNamespaces = await discoverOrgNamespaces(page, token);
  expect(
    orgNamespaces.length,
    'Should discover at least one org namespace',
  ).toBeGreaterThan(0);

  // --- Admin user entity (always runs) ---
  const userResult = await catalogFetch(
    page,
    `/entities/by-name/user/default/${ADMIN_USERNAME}`,
    token,
  );
  expect(userResult.ok, 'Admin user entity should exist in catalog').toBe(true);
  const user = userResult.body;

  expect(user.kind).toBe('User');
  expect(user.metadata.name).toBe(ADMIN_USERNAME);

  // Superuser annotation
  expect(user.metadata.annotations?.['aap.platform/is_superuser']).toBe('true');

  // aap-admins group membership
  const memberOf: string[] = user.spec?.memberOf ?? [];
  expect(
    memberOf.some(m => m.includes('aap-admins')),
    `memberOf should include aap-admins. Got: ${JSON.stringify(memberOf)}`,
  ).toBe(true);

  // Multi-org: team memberships spanning multiple org namespaces
  if (orgNamespaces.length > 1) {
    const orgsWithMembership = orgNamespaces.filter(ns =>
      memberOf.some(m => m.includes(`${ns}/`)),
    );
    expect(
      orgsWithMembership.length,
      `Admin should have teams in multiple orgs. Found in: ${orgsWithMembership.join(', ')}. memberOf: ${JSON.stringify(memberOf)}`,
    ).toBeGreaterThan(1);
  }

  // --- Org group entities (always runs for all discovered orgs) ---
  for (const orgName of orgNamespaces) {
    const orgResult = await catalogFetch(
      page,
      `/entities/by-name/group/${orgName}/${orgName}`,
      token,
    );
    expect(orgResult.ok, `Org '${orgName}' should exist`).toBe(true);
    const org = orgResult.body;
    expect(org.spec?.type).toBe('organization');
    expect(org.kind).toBe('Group');

    const childCount = org.spec?.children?.length ?? 0;
    expect(
      Array.isArray(org.spec?.children),
      `${orgName} should have a children array`,
    ).toBe(true);

    if (childCount === 0) {
      console.log(
        `[Multi-Org] Org '${orgName}' has no child teams (valid for minimal seeding profiles)`,
      );
    }
  }

  // --- aap-admins group ---
  const adminsResult = await catalogFetch(
    page,
    '/entities/by-name/group/default/aap-admins',
    token,
  );
  expect(adminsResult.ok).toBe(true);
  const adminsGroup = adminsResult.body;
  const members: string[] = adminsGroup.spec?.members ?? [];
  expect(members).toContain(`user:default/${ADMIN_USERNAME}`);
});
