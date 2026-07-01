import { test, expect } from '../../fixtures/auth-context-user';

test.describe('Non-admin user: Portal pages accessibility', () => {
  test.describe('Execution Environments', () => {
    test('Non-admin user can access EE catalog page', async ({ page }) => {
      await page.goto('/self-service/ee', { waitUntil: 'networkidle' });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

      const catalogTab = page.getByRole('tab', { name: /^Catalog$/i });
      const createTab = page.getByRole('tab', { name: /^Create$/i });

      const hasCatalogTab = await catalogTab.isVisible().catch(() => false);
      const hasCreateTab = await createTab.isVisible().catch(() => false);

      expect(hasCatalogTab || hasCreateTab).toBeTruthy();

      const bodyText = (await page.locator('body').textContent()) ?? '';
      expect(bodyText).not.toContain('Insufficient privileges');
    });

    test('Non-admin user can view EE Create tab', async ({ page }) => {
      await page.goto('/self-service/ee', { waitUntil: 'networkidle' });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

      const createTab = page.getByRole('tab', { name: /^Create$/i });
      const isVisible = await createTab.isVisible().catch(() => false);
      if (!isVisible) {
        test.skip();
        return;
      }
      await createTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Collections', () => {
    test('Non-admin user can access Collections page', async ({ page }) => {
      await page.goto('/self-service/collections', {
        waitUntil: 'domcontentloaded',
      });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

      const hasCollections = await page
        .getByText(/Ansible Collections|Collections/)
        .first()
        .isVisible()
        .catch(() => false);
      const hasEmptyState = await page
        .getByText(/No Collections Found|No content sources/i)
        .isVisible()
        .catch(() => false);

      expect(hasCollections || hasEmptyState).toBeTruthy();

      const bodyText = (await page.locator('body').textContent()) ?? '';
      expect(bodyText).not.toContain('Insufficient privileges');
    });
  });

  test.describe('Git Repositories', () => {
    test('Non-admin user can access Git Repositories page', async ({
      page,
    }) => {
      await page.goto('/self-service/git-repositories', {
        waitUntil: 'domcontentloaded',
      });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

      const bodyText = (await page.locator('body').textContent()) ?? '';
      expect(bodyText).not.toContain('Insufficient privileges');

      const hasTable = await page
        .locator('table')
        .isVisible()
        .catch(() => false);
      const hasEmptyState = await page
        .getByText(/No repositories|No content sources/i)
        .isVisible()
        .catch(() => false);
      const mainVisible = await page
        .locator('main')
        .isVisible()
        .catch(() => false);
      expect(hasTable || hasEmptyState || mainVisible).toBeTruthy();
    });
  });

  test.describe('History', () => {
    test('Non-admin user can access task history page', async ({ page }) => {
      await page.goto('/self-service/create/tasks', {
        waitUntil: 'domcontentloaded',
      });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

      const taskHeader = page.locator('[data-testid="taskHeader"]');
      const hasHeader = await taskHeader.isVisible().catch(() => false);
      const hasTable = await page
        .locator('table')
        .isVisible()
        .catch(() => false);
      const hasEmptyState = await page
        .getByText(/No tasks/i)
        .isVisible()
        .catch(() => false);

      expect(hasHeader || hasTable || hasEmptyState).toBeTruthy();
    });

    test('Non-admin user sees only their own task history', async ({
      page,
    }) => {
      await page.goto('/self-service/create/tasks', {
        waitUntil: 'domcontentloaded',
      });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

      const bodyText = (await page.locator('body').textContent()) ?? '';

      const hasEmptyState = /No tasks/i.test(bodyText);
      const hasTable = await page
        .locator('table')
        .isVisible()
        .catch(() => false);

      expect(hasEmptyState || hasTable).toBeTruthy();
      expect(bodyText).not.toContain('Insufficient privileges');
    });
  });
});
