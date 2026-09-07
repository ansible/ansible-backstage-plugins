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

  const adminResult = await catalogFetch(
    page,
    `/entities/by-name/user/default/${ADMIN_USERNAME}`,
    token,
  );
  expect(adminResult.ok, 'Admin user entity should exist in catalog').toBe(
    true,
  );
  expect(adminResult.body.metadata?.name).toBe(ADMIN_USERNAME);

  const memberOf = adminResult.body.relations?.filter(
    (r: any) => r.type === 'memberOf',
  );
  const isInAapAdmins = memberOf?.some((r: any) =>
    r.targetRef?.includes('aap-admins'),
  );
  expect(isInAapAdmins, 'Admin should be member of aap-admins group').toBe(
    true,
  );

  if (orgNamespaces.length > 1) {
    const orgGroupRefs = memberOf
      ?.map((r: any) => r.targetRef)
      .filter((ref: string) =>
        orgNamespaces.some(ns => ref.startsWith(`group:${ns}/`)),
      );
    expect(
      orgGroupRefs?.length,
      `Admin should have group memberships across org namespaces`,
    ).toBeGreaterThan(0);
  }
});

test('Multi-Org UI: org group entity pages', async ({ page }) => {
  const token = await getBackstageToken(page);
  const orgNamespaces = await discoverOrgNamespaces(page, token);
  expect(
    orgNamespaces.length,
    'Should discover at least one org namespace',
  ).toBeGreaterThan(0);

  for (const orgSlug of orgNamespaces) {
    const result = await catalogFetch(
      page,
      `/entities/by-name/group/${orgSlug}/${orgSlug}`,
      token,
    );
    expect(
      result.ok,
      `Org group entity should exist for namespace "${orgSlug}"`,
    ).toBe(true);
    expect(result.body.spec?.type).toBe('organization');
  }
});

test('Multi-Org UI: catalog lists org group entities', async ({ page }) => {
  const token = await getBackstageToken(page);
  const orgNamespaces = await discoverOrgNamespaces(page, token);
  expect(
    orgNamespaces.length,
    'Should discover at least one org namespace',
  ).toBeGreaterThan(0);

  const result = await catalogFetch(
    page,
    '/entities?filter=kind=Group,spec.type=organization&limit=100',
    token,
  );
  expect(result.ok, 'Should fetch org group entities').toBe(true);

  const groups: any[] = Array.isArray(result.body)
    ? result.body
    : (result.body?.items ?? []);
  const groupNamespaces = new Set(
    groups.map((g: any) => g.metadata?.namespace),
  );

  for (const orgSlug of orgNamespaces) {
    expect(
      groupNamespaces.has(orgSlug),
      `Org group for "${orgSlug}" should be in catalog`,
    ).toBe(true);
  }
});
