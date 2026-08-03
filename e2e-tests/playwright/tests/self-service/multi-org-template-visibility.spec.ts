import { test, expect } from '../../fixtures/auth-context';
import { getBackstageToken, catalogFetch } from '../../utils/backstage-api';
import { loginAAP } from '../../utils/auth';

/**
 * Multi-Org Template Visibility Tests
 *
 * Test A — Catalog metadata: verifies template entities have correct
 *   org annotations and namespaces when multi-org is configured.
 *
 * Test B — User-scoped visibility: compares the templates visible on
 *   the self-service page for a superuser vs a normal user.  Visibility
 *   is driven by AAP's native RBAC (via the user's OAuth token), not
 *   Backstage org membership.
 *
 * Requires:
 *   - rhdh-local running with multi-org config
 *   - Job template sync completed (RHAAP_TOKEN valid)
 *   - AAP_NORMAL_USER_ID / AAP_NORMAL_USER_PASS set in .env
 */

async function discoverOrgNamespaces(
  page: import('@playwright/test').Page,
  token: string,
): Promise<string[]> {
  const result = await catalogFetch(
    page,
    '/entities?filter=kind=Group,spec.type=organization&limit=100',
    token,
  );
  if (!result.ok) return [];
  const groups: any[] = Array.isArray(result.body)
    ? result.body
    : (result.body?.items ?? []);
  return [
    ...new Set(
      groups
        .map((g: any) => g.metadata?.namespace)
        .filter((ns: string | undefined): ns is string => !!ns),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Test A: template org metadata via catalog API
// ---------------------------------------------------------------------------

test('Template org metadata: annotations and namespaces', async ({ page }) => {
  const token = await getBackstageToken(page);

  const orgNamespaces = await discoverOrgNamespaces(page, token);
  expect(
    orgNamespaces.length,
    'Should discover at least one org namespace from catalog',
  ).toBeGreaterThan(0);

  const result = await catalogFetch(
    page,
    '/entities?filter=kind=template&limit=500',
    token,
  );
  expect(result.ok, 'Should be able to list template entities').toBe(true);

  const templates: any[] = Array.isArray(result.body)
    ? result.body
    : (result.body?.items ?? []);

  const aapTemplates = templates.filter(
    (t: any) => t.metadata?.aapJobTemplateId,
  );

  expect(
    aapTemplates.length,
    'Should have at least one AAP-backed template in catalog',
  ).toBeGreaterThan(0);

  for (const tpl of aapTemplates) {
    const orgAnnotation =
      tpl.metadata?.annotations?.['ansible.com/organization'];
    expect(
      orgAnnotation,
      `Template "${tpl.metadata.name}" (ns: ${tpl.metadata.namespace}) should have ansible.com/organization`,
    ).toBeTruthy();

    expect(
      orgNamespaces,
      `Template "${tpl.metadata.name}" namespace "${tpl.metadata.namespace}" should be a discovered org namespace`,
    ).toContain(tpl.metadata.namespace);
  }

  const namespacesPresent = new Set(
    aapTemplates.map((t: any) => t.metadata.namespace),
  );
  for (const ns of orgNamespaces) {
    expect(
      namespacesPresent.has(ns),
      `Should have at least one template in namespace "${ns}"`,
    ).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// Test B: admin vs normal user template visibility on self-service page
// ---------------------------------------------------------------------------

async function getTemplateCount(
  page: import('@playwright/test').Page,
): Promise<number> {
  await page.goto('/self-service/catalog', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  // Wait for the "All" count to appear in the sidebar (autocomplete fetch
  // must complete before the grid renders filtered templates).
  try {
    await page.getByText(/All/i).first().waitFor({ timeout: 15000 });
  } catch {
    // Page may not have sidebar if no templates loaded
  }
  await page.waitForTimeout(3000);

  // The sidebar shows "All <count>" — extract the number
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  const allMatch = bodyText.match(/All\s+(\d+)/i);
  if (allMatch) return parseInt(allMatch[1], 10);

  // Fallback: count visible "Start" links (one per template card)
  return page
    .getByRole('link', { name: 'Start' })
    .count()
    .catch(() => 0);
}

test('Template visibility: admin sees >= normal user templates', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const normalUserId = process.env.AAP_NORMAL_USER_ID;
  const normalUserPass = process.env.AAP_NORMAL_USER_PASS;

  if (!normalUserId || !normalUserPass) {
    test.skip(
      true,
      'AAP_NORMAL_USER_ID / AAP_NORMAL_USER_PASS not set — skipping visibility comparison',
    );
    return;
  }

  // --- Admin template count (existing authenticated session) ---
  const adminCount = await getTemplateCount(page);
  console.log(`[Visibility] Admin sees ${adminCount} templates`);

  // --- Normal user template count (fresh context) ---
  const normalContext = await browser.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:7007',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });

  const normalPage = await normalContext.newPage();

  let normalCount = 0;
  let got404 = false;
  let gotForbidden = false;

  try {
    const origId = process.env.AAP_USER_ID;
    const origPass = process.env.AAP_USER_PASS;
    try {
      process.env.AAP_USER_ID = normalUserId;
      process.env.AAP_USER_PASS = normalUserPass;
      await loginAAP(normalPage);
    } finally {
      process.env.AAP_USER_ID = origId;
      process.env.AAP_USER_PASS = origPass;
    }

    // Navigate to self-service catalog and check what the normal user sees
    await normalPage.goto('/self-service/catalog', {
      waitUntil: 'domcontentloaded',
    });
    await normalPage.waitForLoadState('networkidle', { timeout: 30000 });
    await normalPage.waitForTimeout(3000);

    // Check if the user landed on a 404 or permission-denied page
    const pageText = await normalPage
      .locator('body')
      .innerText()
      .catch(() => '');
    got404 =
      pageText.includes("couldn't find that page") || pageText.includes('404');
    gotForbidden =
      pageText.includes('Forbidden') || pageText.includes('not authorized');

    if (!got404 && !gotForbidden) {
      const allMatch = pageText.match(/All\s+(\d+)/i);
      if (allMatch) {
        normalCount = parseInt(allMatch[1], 10);
      } else {
        normalCount = await normalPage
          .getByRole('link', { name: 'Start' })
          .count()
          .catch(() => 0);
      }
    }

    console.log(
      `[Visibility] Normal user sees ${normalCount} templates (404=${got404}, forbidden=${gotForbidden})`,
    );
  } finally {
    await normalPage.close();
    await normalContext.close();
  }

  // --- Assertions ---
  expect(adminCount, 'Admin should see at least 1 template').toBeGreaterThan(0);

  // Admin must see at least as many templates as the normal user
  expect(
    adminCount,
    `Admin (${adminCount}) should see >= normal user (${normalCount}) templates`,
  ).toBeGreaterThanOrEqual(normalCount);

  if (got404 || gotForbidden) {
    console.log(
      `[Visibility] Normal user lacks permission to view templates page — RBAC correctly restricts access`,
    );
  } else if (adminCount > normalCount) {
    console.log(
      `[Visibility] Admin sees ${adminCount - normalCount} more templates than normal user — AAP RBAC is filtering`,
    );
  } else {
    console.log(`[Visibility] Both users see the same ${adminCount} templates`);
  }
});
