import { test, expect } from '../../fixtures/auth-context';
import { getBackstageToken, catalogFetch } from '../../utils/backstage-api';
import { loginAAP } from '../../utils/auth';

/**
 * Multi-Org Collision Detection Tests (API-based)
 *
 * Verifies that ID-based entity naming prevents collisions by querying
 * the catalog API directly. Uses catalogFetch() instead of UI navigation
 * for compatibility with self-service-only deployments.
 *
 * Test Plan MR !305 Scenarios:
 * - TC0091: Same team name in different orgs
 * - TC0092: Same JT name in different orgs
 * - TC0094: Case-only JT collision
 * - TC0095: Case-only user collision
 * - TC0096-TC0100: Special char names
 * - TC0131-137: Display names preserved, refs use IDs
 */

function catalogItems(body: unknown): any[] {
  return Array.isArray(body) ? body : ((body as any)?.items ?? []);
}

function templateCardTestId(template: {
  metadata?: { namespace?: string; name?: string };
}): string {
  const namespace = template.metadata?.namespace ?? 'default';
  const name = template.metadata?.name ?? '';
  return `${namespace}-${name}`;
}

test('Same team name in different orgs both exist', async ({ page }) => {
  const token = await getBackstageToken(page);

  const result = await catalogFetch(
    page,
    '/entities?filter=kind=Group,spec.type=team&limit=500',
    token,
  );

  expect(result.ok, 'Should fetch team groups from catalog').toBe(true);

  const teams = catalogItems(result.body);

  const deployTeams = teams.filter((t: any) =>
    t.metadata?.title?.includes('Deploy Team'),
  );

  expect(
    deployTeams.length,
    'At least two teams with "Deploy Team" in title should exist',
  ).toBeGreaterThanOrEqual(2);

  const names = deployTeams.map((t: any) => t.metadata?.name).filter(Boolean);
  expect(new Set(names).size, 'Deploy teams must have distinct entity names').toBe(
    names.length,
  );

  const orgIds = deployTeams
    .map(
      (t: any) =>
        t.metadata?.annotations?.['ansible.com/organization'] ??
        t.metadata?.namespace,
    )
    .filter(Boolean);
  expect(
    new Set(orgIds).size,
    'Deploy teams should belong to different organizations',
  ).toBeGreaterThanOrEqual(2);
});

test('Same job template name in different orgs both exist', async ({
  page,
}) => {
  const token = await getBackstageToken(page);
  const catalogResult = await catalogFetch(
    page,
    '/entities?filter=kind=template&limit=500',
    token,
  );
  expect(catalogResult.ok, 'Should list template entities').toBe(true);

  const deployTemplates = catalogItems(catalogResult.body).filter((t: any) => {
    const title = (t.metadata?.title ?? '').trim();
    return title === 'Deploy';
  });

  expect(
    deployTemplates.length,
    'At least two templates with display name exactly "Deploy" should exist',
  ).toBeGreaterThanOrEqual(2);

  const entityNames = deployTemplates
    .map((t: any) => t.metadata?.name)
    .filter(Boolean);
  expect(
    new Set(entityNames).size,
    'Deploy templates must have distinct ID-based entity names',
  ).toBe(entityNames.length);
  for (const name of entityNames) {
    expect(name, 'Template entity ref should be ID-based').toMatch(/^aap-jt-\d+$/);
  }

  const orgIdentities = deployTemplates
    .map(
      (t: any) =>
        t.metadata?.annotations?.['ansible.com/organization'] ??
        t.metadata?.namespace,
    )
    .filter(Boolean);
  expect(
    new Set(orgIdentities).size,
    'Deploy templates should belong to different organizations',
  ).toBeGreaterThanOrEqual(2);

  await page.goto('/self-service/catalog', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  const templateTitles = page.locator(
    '[data-testid="templates-container"] [data-testid="template--title"]',
  );
  await expect(templateTitles.first()).toBeVisible({ timeout: 30000 });

  const searchBox = page.locator('input[placeholder*="Search"]').first();
  await expect(searchBox).toBeVisible({ timeout: 15000 });
  await searchBox.fill('Deploy');

  const exactDeployTitles = templateTitles.filter({ hasText: /^Deploy$/ });
  await expect
    .poll(() => exactDeployTitles.count(), { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);

  const visibleDeployCount = await exactDeployTitles.count();
  expect(
    visibleDeployCount,
    'At least two exactly "Deploy" templates should be visible on the catalog page',
  ).toBeGreaterThanOrEqual(2);

  await exactDeployTitles.first().click({ timeout: 10000 });

  await page.waitForURL(/\/catalog\/.*\/aap-jt-\d+/, { timeout: 10000 });

  const url = page.url();
  expect(
    url,
    'Template URL should use ID-based entity ref (aap-jt-*)',
  ).toMatch(/aap-jt-\d+/);

  const ownerRef = page.getByText(/group:[^/\s]+\/aap-org-\d+/);
  await expect(ownerRef).toBeVisible({ timeout: 10000 });
  await expect(ownerRef).toHaveText(/aap-org-\d+/);
});

test('Case-only job template collision (Hello World vs hello world)', async ({
  page,
}) => {
  await page.goto('/self-service/catalog', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  const templateTitles = page.locator(
    '[data-testid="templates-container"] [data-testid="template--title"]',
  );
  await expect(templateTitles.first()).toBeVisible({ timeout: 30000 });

  const titles = (await templateTitles.allTextContents()).map(t => t.trim());
  const hasUpper = titles.includes('Hello World');
  const hasLower = titles.includes('hello world');

  expect(hasUpper, 'Catalog should include "Hello World"').toBe(true);
  expect(hasLower, 'Catalog should include "hello world"').toBe(true);
});

test('Special character org/team/user names handled', async ({ page }) => {
  const token = await getBackstageToken(page);

  const orgResult = await catalogFetch(
    page,
    '/entities?filter=kind=Group,spec.type=organization&limit=100',
    token,
  );

  expect(orgResult.ok, 'Should fetch org groups from catalog').toBe(true);

  const orgs = catalogItems(orgResult.body);

  const specialCharOrgs = orgs.filter((org: any) => {
    const title = org.metadata?.title || '';
    return /[Üü@!]/.test(title);
  });

  expect(
    specialCharOrgs.length,
    'Orgs with special characters (Ünicode Tëst, Test@Org!) should exist',
  ).toBeGreaterThanOrEqual(1);

  const userResult = await catalogFetch(
    page,
    '/entities?filter=kind=User&limit=500',
    token,
  );

  expect(userResult.ok, 'Should fetch users from catalog').toBe(true);

  const users = catalogItems(userResult.body);

  const specialCharUsers = users.filter((user: any) => {
    const aapUsername =
      user.metadata?.annotations?.['ansible.com/aap-username'] || '';
    return /[@+_-]/.test(aapUsername);
  });

  expect(
    specialCharUsers.length,
    'Users with special char usernames should exist',
  ).toBeGreaterThanOrEqual(1);
});

test('Display names preserved, refs use IDs', async ({ page }) => {
  await page.goto('/self-service/catalog', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  const templateTitles = page.locator(
    '[data-testid="templates-container"] [data-testid="template--title"]',
  );
  await expect(templateTitles.first()).toBeVisible({ timeout: 30000 });

  const allTitles = (await templateTitles.allTextContents()).map(t => t.trim());
  const deployIndex = allTitles.findIndex(t => t === 'Deploy');
  expect(deployIndex, 'Deploy template should be visible').toBeGreaterThanOrEqual(
    0,
  );
  const deployTemplate = templateTitles.nth(deployIndex);
  await expect(deployTemplate).toBeVisible({ timeout: 10000 });

  const displayName = (await deployTemplate.textContent())?.trim() ?? '';
  expect(displayName.length, 'Deploy template should have a display title').toBeGreaterThan(
    0,
  );

  await deployTemplate.click({ timeout: 10000 });

  await page.waitForURL(/\/catalog\/.*\/aap-jt-\d+/, { timeout: 10000 });
  const url = page.url();
  expect(url, 'URL should use ID-based entity ref (aap-jt-*)').toMatch(
    /aap-jt-\d+/,
  );

  const heading = page.locator('h1, h2').first();
  await expect(heading).toBeVisible({ timeout: 10000 });
  await expect(heading).toContainText(displayName);
});

test('Normal user sees scoped templates only', async ({ page, browser }) => {
  const normalUserId = process.env.AAP_NORMAL_USER_ID;
  const normalUserPass = process.env.AAP_NORMAL_USER_PASS;

  if (!normalUserId || !normalUserPass) {
    test.skip(
      true,
      'AAP_NORMAL_USER_ID / AAP_NORMAL_USER_PASS not set — skipping scoped visibility',
    );
    return;
  }

  const adminToken = await getBackstageToken(page);
  const adminResult = await catalogFetch(
    page,
    '/entities?filter=kind=template&limit=500',
    adminToken,
  );
  expect(adminResult.ok).toBe(true);
  const adminTemplates = catalogItems(adminResult.body).filter(
    (t: any) => t.metadata?.aapJobTemplateId,
  );
  expect(adminTemplates.length).toBeGreaterThan(0);

  const normalContext = await browser.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:7007',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });
  const normalPage = await normalContext.newPage();

  try {
    await loginAAP(normalPage, {
      userId: normalUserId,
      password: normalUserPass,
    });

    await normalPage.goto('/self-service/catalog', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const templateCards = normalPage.locator(
      '[data-testid="templates-container"] .MuiCard-root[data-testid]',
    );
    await expect(templateCards.first()).toBeVisible({ timeout: 30000 });
    const visibleCardIds = await templateCards.evaluateAll(cards =>
      cards
        .map(card => card.getAttribute('data-testid'))
        .filter((id): id is string => Boolean(id)),
    );
    expect(
      visibleCardIds.length,
      'Normal user should see at least one permitted template card',
    ).toBeGreaterThan(0);

    const normalToken = await getBackstageToken(normalPage);
    const normalResult = await catalogFetch(
      normalPage,
      '/entities?filter=kind=template&limit=500',
      normalToken,
    );
    expect(normalResult.ok).toBe(true);
    const normalTemplates = catalogItems(normalResult.body).filter(
      (t: any) => t.metadata?.aapJobTemplateId,
    );

    expect(
      normalTemplates.length,
      'Normal user catalog scope should not exceed admin-visible AAP templates',
    ).toBeLessThanOrEqual(adminTemplates.length);

    const permittedCardIds = new Set(
      normalTemplates.map((t: any) => templateCardTestId(t)),
    );
    for (const cardId of visibleCardIds) {
      expect(
        permittedCardIds.has(cardId),
        `Visible template card "${cardId}" should be in the normal user's permitted catalog scope`,
      ).toBe(true);
    }

    const adminOnly = adminTemplates.filter(
      (t: any) =>
        !normalTemplates.some(
          (n: any) => templateCardTestId(n) === templateCardTestId(t),
        ),
    );
    expect(
      adminOnly.length,
      'Fixture should include templates visible to admin but not the normal user',
    ).toBeGreaterThan(0);

    const adminOnlyCardIds = adminOnly.map((t: any) => templateCardTestId(t));
    for (const cardId of adminOnlyCardIds) {
      expect(
        visibleCardIds,
        `Normal user catalog must not render admin-only template "${cardId}"`,
      ).not.toContain(cardId);
    }
  } finally {
    await normalPage.close();
    await normalContext.close();
  }
});

test('User entity uses ID-based naming in catalog', async ({ page }) => {
  const token = await getBackstageToken(page);

  const result = await catalogFetch(
    page,
    '/entities?filter=kind=User&limit=500',
    token,
  );

  expect(result.ok, 'Should fetch users from catalog').toBe(true);

  const users = catalogItems(result.body);
  expect(users.length, 'Should have users in catalog').toBeGreaterThan(0);

  const aapBackedUsers = users.filter(
    (u: any) =>
      u.metadata?.annotations?.['ansible.com/aap-user-id'] != null ||
      /^aap-user-\d+$/.test(u.metadata?.name ?? ''),
  );

  expect(
    aapBackedUsers.length,
    'Should have AAP-backed users with ID-based entity names',
  ).toBeGreaterThan(0);

  for (const user of aapBackedUsers) {
    expect(user.metadata?.name, 'AAP user entity name should be ID-based').toMatch(
      /^aap-user-\d+$/,
    );
  }

  const names = aapBackedUsers.map((u: any) => u.metadata?.name);
  expect(new Set(names).size, 'Distinct users must have distinct names').toBe(
    names.length,
  );

  const userTitles = aapBackedUsers
    .map((u: any) => u.metadata?.title)
    .filter(Boolean);
  const hasHumanTitles = userTitles.some(
    (title: string) => !/^aap-user-\d+$/.test(title),
  );
  expect(hasHumanTitles, 'User display titles should be human-readable').toBe(
    true,
  );
});
