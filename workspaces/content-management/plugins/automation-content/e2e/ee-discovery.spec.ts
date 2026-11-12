import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { AxeResults } from 'axe-core';

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
  const trigger = page.getByRole('button', { name: /Tag or digest/ });
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
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
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

test('opens a native repository favorite and preserves exact tag aliases through reload and history', async ({
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
  const add = row.getByRole('button', {
    name: `Add ${repository} to favorites`,
  });
  const remove = row.getByRole('button', {
    name: `Remove ${repository} from favorites`,
  });
  const wasStarred = await remove.isVisible();
  if (!wasStarred) {
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(remove).toBeVisible();
  }
  const favoritesOnly = page.getByRole('checkbox', { name: 'Favorites only' });
  await favoritesOnly.focus();
  await page.keyboard.press('Space');
  await expect(favoritesOnly).toBeChecked();
  await expect(
    page.getByText(/Table page loaded. Showing 1 to 1 of 1/),
  ).toBeAttached();
  await expect(image).toBeVisible();
  await scan(
    page,
    testInfo,
    '[role="region"][aria-label="EE images"]',
    'inventory',
  );
  await row.focus();
  await row.press('Enter');
  await expect(page).toHaveURL(/\/catalog\/default\/component\/ee-repo-/);
  const stockStar = page.getByRole('button', {
    name: 'Remove from favorites',
    exact: true,
  });
  await expect(stockStar).toBeVisible();
  try {
    await chooseTag(page, firstAlias);
    const digest = page.locator('dd code').first();
    const initialDigest = await digest.textContent();
    expect(initialDigest).toBeTruthy();
    await chooseTag(page, secondAlias);
    await expect(digest).toHaveText(initialDigest!);
    await expect(page.getByText(new RegExp(`:${secondAlias}$`))).toBeVisible();
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await page
      .getByRole('button', { name: 'Copy pull reference' })
      .press('Enter');
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(new RegExp(`:${secondAlias}$`));
    const evidence = page.getByRole('button', { name: 'Signing evidence' });
    await evidence.focus();
    await page.keyboard.press('Enter');
    await scan(
      page,
      testInfo,
      '[role=region][aria-label="Image details"]',
      'detail-evidence',
    );
    await page.getByRole('tab', { name: 'Contents', exact: true }).click();
    await expect(page).toHaveURL(/[?&]section=contents/);
    await page.reload();
    await expect(
      page.getByRole('tab', { name: 'Contents', selected: true }),
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
      page.getByRole('tab', { name: 'Contents', selected: true }),
    ).toBeVisible();
    if (otherDigestTag) {
      await chooseTag(page, otherDigestTag);
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
      await expect(digest).not.toHaveText(initialDigest!);
    }
    await expect(stockStar).toBeVisible();
  } finally {
    if (!wasStarred && (await stockStar.isVisible())) await stockStar.click();
  }
});

test('uses one favorite filter across the third results page and both inventory views', async ({
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
  const add = firstRepository.getByRole('button', {
    name: `Add ${name} to favorites`,
  });
  const remove = page.getByRole('button', {
    name: `Remove ${name} from favorites`,
  });
  const alreadyStarred = await remove.isVisible();
  if (!alreadyStarred) {
    await add.click();
    await expect(remove).toBeVisible();
  }
  try {
    const favorites = page.getByRole('checkbox', { name: 'Favorites only' });
    await favorites.focus();
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('link', { name: name!, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Grid view' }).click();
    await expect(
      page.getByRole('link', { name: name!, exact: true }),
    ).toBeVisible();
    await expect(remove).toBeVisible();
  } finally {
    if (!alreadyStarred && (await remove.isVisible())) await remove.click();
  }
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
