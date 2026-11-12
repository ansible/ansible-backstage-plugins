import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { AxeResults } from 'axe-core';
import type { ArtifactContents } from '../src/api';

const repository =
  process.env.EE_DISCOVERY_REPOSITORY ?? 'demo/utopia-storage-ee';
const firstAlias = process.env.EE_DISCOVERY_FIRST_ALIAS ?? 'latest';
const secondAlias = process.env.EE_DISCOVERY_SECOND_ALIAS ?? '2.0.0';
const otherDigestTag =
  process.env.EE_DISCOVERY_OTHER_DIGEST_TAG ??
  (repository === 'demo/utopia-storage-ee' ? '1.0.0' : undefined);

async function openInventory(page: Page): Promise<void> {
  await page.goto('/content/ee');
  const enter = page.getByRole('button', { name: 'Enter', exact: true });
  const search = page.getByRole('searchbox', { name: 'Search images' });
  await Promise.race([
    enter.waitFor({ state: 'visible' }),
    search.waitFor({ state: 'visible' }),
  ]);
  if (await enter.isVisible()) await enter.click();
  await expect(search).toBeVisible();
}

async function chooseTag(page: Page, tag: string): Promise<void> {
  const trigger = page.getByRole('button', { name: /Version/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const option = page.getByRole('option', { name: tag, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tag'))
    .toBe(tag);
}

async function scan(
  page: Page,
  testInfo: TestInfo,
  selector: string,
  name: string,
): Promise<void> {
  const script = new URL('/__ee-discovery-test__/axe.js', page.url()).href;
  await page.route(script, route =>
    route.fulfill({
      path: require.resolve('axe-core/axe.min.js'),
      contentType: 'application/javascript',
    }),
  );
  try {
    await page.addScriptTag({ url: script });
  } finally {
    await page.unroute(script);
  }
  const results = await page.evaluate(async target => {
    const { axe } = window as Window & {
      axe: { run(context: string): Promise<AxeResults> };
    };
    return axe.run(target);
  }, selector);
  await testInfo.attach(`${name}-axe.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  expect(
    results.violations.filter(
      item => item.impact === 'serious' || item.impact === 'critical',
    ),
  ).toEqual([]);
}

test('composes Images and Definitions and exposes a row actions menu', async ({
  page,
}) => {
  await openInventory(page);
  await expect(page).toHaveURL(/\/content\/ee\/images$/);
  const tabs = page.getByRole('tablist', { name: 'Toolbar tabs' });
  await expect(tabs.getByRole('tab')).toHaveText(['Images', 'Definitions']);
  await expect(tabs.getByRole('tab', { name: 'Images' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const create = page.getByRole('link', { name: 'Create', exact: true });
  await expect(create).toHaveAttribute('href', /^\/create\/templates/);

  const menuButton = page
    .getByRole('button', { name: /^Actions for / })
    .first();
  await expect(menuButton).toBeEnabled();
  const row = page.getByRole('row').filter({ has: menuButton }).first();
  await row.focus();
  for (let step = 0; step < 12; step += 1) {
    if (await menuButton.evaluate(button => document.activeElement === button))
      break;
    await page.keyboard.press('ArrowRight');
  }
  await expect(menuButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('menuitem', { name: 'View details' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/content\/ee\/images$/);
  await page.keyboard.press('Escape');

  await tabs.getByRole('tab', { name: 'Definitions' }).click();
  await expect(page).toHaveURL(/\/content\/ee\/definitions(?:\?|$)/);
  await expect(tabs.getByRole('tab', { name: 'Definitions' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('tab', { name: 'Create', exact: true }),
  ).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Images' }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Search images' }),
  ).toBeVisible();

  await page.goto('/self-service/ee/catalog');
  await expect(page).toHaveURL(/\/content\/ee\/definitions(?:\?|$)/);
  await expect(tabs.getByRole('tab', { name: 'Definitions' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await create.click();
  await expect(page).toHaveURL(/\/create\/templates(?:\?|$)/);
  await expect(
    page.getByRole('tab', { name: 'Templates', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('sends source type and status filters to the inventory query', async ({
  page,
}) => {
  await openInventory(page);
  await expect(page.getByRole('button', { name: /All versions/ })).toHaveCount(
    0,
  );
  const query = page.waitForResponse(response => {
    const request = response.request();
    if (
      !request.url().endsWith('/execution-environment-repositories/query') ||
      request.method() !== 'POST'
    )
      return false;
    const body = request.postDataJSON();
    return (
      body.sourceType === 'external-registry' &&
      body.status === 'available' &&
      body.page === 1 &&
      response.ok()
    );
  });
  await page.getByRole('button', { name: /All source types/ }).click();
  await page.getByRole('option', { name: 'External registry' }).click();
  await page.getByRole('button', { name: /All statuses/ }).click();
  await page.getByRole('option', { name: 'Available', exact: true }).click();
  await query;
});

test('opens an image repository and preserves exact tag aliases through reload and history', async ({
  page,
}, testInfo) => {
  await openInventory(page);
  const search = page.getByRole('searchbox', { name: 'Search images' });
  await search.focus();
  await page.keyboard.insertText(repository);
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: repository, exact: true }) });
  const image = row.getByRole('link', { name: repository, exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveCSS('text-decoration-line', 'underline');
  await scan(
    page,
    testInfo,
    '[role="region"][aria-label="EE images"]',
    'inventory',
  );
  await row.focus();
  await row.press('Enter');
  await expect(page).toHaveURL(/\/catalog\/default\/component\/ee-repo-/);
  await expect(
    page
      .getByRole('navigation', { name: 'Breadcrumbs' })
      .getByRole('link', { name: 'Execution Environments', exact: true }),
  ).toHaveAttribute('href', '/content/ee');
  await chooseTag(page, firstAlias);
  const catalogCards = page.getByRole('heading', {
    name: /^(About|Depends on components|Depends on resources)$/,
  });
  await expect(catalogCards).toHaveCount(0);
  const digest = page.locator('dd code').first();
  const initialDigest = await digest.textContent();
  expect(initialDigest).toBeTruthy();
  await chooseTag(page, secondAlias);
  await expect(digest).toHaveText(initialDigest!);
  await expect(
    page.locator('code').filter({ hasText: new RegExp(`:${secondAlias}$`) }),
  ).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page
    .getByRole('button', { name: 'Copy pull reference' })
    .click({ timeout: 5000 });
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(new RegExp(`:${secondAlias}$`));
  const overview = page.getByRole('tabpanel', { name: 'Overview' });
  const facts = await overview.locator('dt').allTextContents();
  expect(facts[0]).toBe('Image');
  expect(
    facts.slice(facts.indexOf('Signing'), facts.indexOf('Signing') + 2),
  ).toEqual(['Signing', 'Signing Evidence']);
  await expect(overview.getByText(/^Signature:/)).toHaveCount(0);
  await scan(
    page,
    testInfo,
    '[role=region][aria-label="Image details"]',
    'detail-evidence',
  );
  await page.getByRole('tab', { name: 'All Content', exact: true }).click();
  await expect(page).toHaveURL(/[?&]section=contents/);
  await expect(catalogCards).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('tab', { name: 'All Content', selected: true }),
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tag'))
    .toBe(secondAlias);
  await page.goBack();
  await expect(
    page.getByRole('tab', { name: 'Overview', selected: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole('tab', { name: 'All Content', selected: true }),
  ).toBeVisible();
  if (otherDigestTag) {
    await chooseTag(page, otherDigestTag);
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(digest).not.toHaveText(initialDigest!);
    const currentDigest = await digest.textContent();
    expect(currentDigest).toBeTruthy();

    const matchesOlderArtifact = (url: URL) =>
      decodeURIComponent(url.pathname).startsWith(
        '/api/automation-content/execution-environments/',
      ) && decodeURIComponent(url.pathname).endsWith(`@${initialDigest}`);
    let release = () => {};
    let held = false;
    const delay = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route(matchesOlderArtifact, async route => {
      held = true;
      await delay;
      await route.continue();
    });

    try {
      await chooseTag(page, secondAlias);
      await expect.poll(() => held).toBe(true);
      await chooseTag(page, otherDigestTag);
      await expect(digest).toHaveText(currentDigest!);
      const olderResponse = page.waitForResponse(
        response =>
          matchesOlderArtifact(new URL(response.url())) && response.ok(),
      );
      release();
      await olderResponse;
      await expect(digest).toHaveText(currentDigest!);
      await expect
        .poll(() => new URL(page.url()).searchParams.get('tag'))
        .toBe(otherDigestTag);
    } finally {
      release();
      await page.unroute(matchesOlderArtifact);
    }
  }
});

test('shows only the discovered image inventory and distinguishes empty states', async ({
  page,
}) => {
  const contents: ArtifactContents = {
    enumeration: { status: 'partial', source: 'blob-fetch' },
    collections: [
      {
        namespace: 'ansible',
        name: 'netcommon',
        fqcn: 'ansible.netcommon',
        version: '7.2.0',
        counts: { plugins: 8 },
      },
    ],
    items: [],
  };
  await page.route(
    '**/api/automation-content/execution-environments/*/contents',
    route => route.fulfill({ json: contents }),
  );
  await openInventory(page);
  const search = page.getByRole('searchbox', { name: 'Search images' });
  await search.focus();
  await page.keyboard.insertText(repository);
  await page.getByRole('link', { name: repository, exact: true }).click();
  await page.getByRole('tab', { name: 'All Content', exact: true }).click();

  const table = page
    .getByRole('tabpanel', { name: 'All Content' })
    .getByRole('grid');
  const row = table.getByRole('row', { name: /ansible\.netcommon/ });
  await expect(row.getByText('7.2.0', { exact: true })).toBeVisible();
  await expect(row.getByText('8 plugins', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Only part of the collection inventory is available.'),
  ).toHaveCount(0);

  contents.collections = [];
  for (const [status, message] of [
    ['complete', 'This image contains no indexed collections.'],
    ['partial', 'Only part of the collection inventory is available.'],
    ['unknown', 'The collection inventory could not be determined.'],
  ] as const) {
    contents.enumeration.status = status;
    await page.reload();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(table).toHaveCount(0);
  }
});

test('retains the third results page when switching inventory views', async ({
  page,
}) => {
  await openInventory(page);
  const next = page.getByRole('button', { name: 'Next table page' });
  const range = page.getByText(/21.?[-–].?\d+ of \d+/);
  await next.click();
  await expect(
    page.getByText(/Table page loaded. Showing 11 to 20 of/),
  ).toBeAttached();
  await next.click();
  await expect(range).toBeVisible();

  const firstRepository = page
    .getByRole('row')
    .filter({ has: page.getByRole('link') })
    .first();
  const name = await firstRepository.getByRole('link').textContent();
  expect(name).toBeTruthy();
  await page.getByRole('button', { name: 'Change image view' }).click();
  await page.getByRole('menuitem', { name: 'Grid view' }).click();
  await expect(
    page.getByRole('link', { name: name!, exact: true }),
  ).toBeVisible();
});

for (const [status, message] of [
  [503, 'Image repositories could not be loaded.'],
  [403, 'You do not have permission to view execution environment images.'],
] as const)
  test(`fixture: preserves recovery after inventory response ${status}`, async ({
    page,
  }) => {
    const query =
      '**/api/automation-content/execution-environment-repositories/query';
    let fail = true;
    await page.route(query, route =>
      fail
        ? route.fulfill({ status, json: { error: 'Fixture response' } })
        : route.continue(),
    );
    await openInventory(page);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByText('Fixture response')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('row').first()).toBeVisible();
  });

test.afterEach(async ({ page }, testInfo) => {
  const { theme, viewport } = await page.evaluate(() => ({
    theme: document.body.dataset.themeMode,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }));
  await testInfo.attach('browser-context.json', {
    body: JSON.stringify({ theme, viewport }),
    contentType: 'application/json',
  });
});
