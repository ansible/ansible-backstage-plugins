import { test, expect } from '../../fixtures/auth-context';
import { getBackstageToken, catalogFetch } from '../../utils/backstage-api';

/**
 * Multi-Org Catalog API Tests
 *
 * Verifies that the Backstage catalog API reflects correct multi-org
 * entity relationships for a superuser: org group entities, team
 * membership in both org namespaces, and aap-admins group membership.
 *
 * All assertions run in a single test to avoid repeated OAuth logins.
 *
 * Requires: rhdh-local running with multi-org config (orgs: [Default, 11-org])
 * Auth: AAP OAuth via shared auth-context fixture + Backstage Bearer token
 */

const ADMIN_USERNAME = process.env.AAP_USER_ID || 'admin';

test('Multi-Org Catalog API: superuser entity structure', async ({ page }) => {
  const token = await getBackstageToken(page);

  // --- Admin user entity ---
  const userResult = await catalogFetch(
    page,
    `/entities/by-name/user/default/${ADMIN_USERNAME}`,
    token,
  );
  expect(userResult.ok, 'Admin user entity should exist in catalog').toBe(
    true,
  );
  const user = userResult.body;

  expect(user.kind).toBe('User');
  expect(user.metadata.name).toBe(ADMIN_USERNAME);

  // Superuser annotation
  expect(user.metadata.annotations?.['aap.platform/is_superuser']).toBe(
    'true',
  );

  // aap-admins group membership
  const memberOf: string[] = user.spec?.memberOf ?? [];
  expect(memberOf, 'memberOf should include aap-admins').toContain(
    'aap-admins',
  );

  // Team memberships spanning both org namespaces
  const inDefaultOrg = memberOf.some(m => m.includes('aap-default/'));
  const in11Org = memberOf.some(m => m.includes('11org/'));
  expect(
    inDefaultOrg,
    `Admin should have team in aap-default. memberOf: ${JSON.stringify(memberOf)}`,
  ).toBe(true);
  expect(
    in11Org,
    `Admin should have team in 11org. memberOf: ${JSON.stringify(memberOf)}`,
  ).toBe(true);

  // --- Org group entities ---
  for (const orgName of ['aap-default', '11org']) {
    const orgResult = await catalogFetch(
      page,
      `/entities/by-name/group/default/${orgName}`,
      token,
    );
    expect(orgResult.ok, `Org '${orgName}' should exist`).toBe(true);
    const org = orgResult.body;
    expect(org.spec?.type).toBe('organization');
    expect(org.kind).toBe('Group');
    expect(
      org.spec?.children?.length,
      `${orgName} should have child teams`,
    ).toBeGreaterThan(0);
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
