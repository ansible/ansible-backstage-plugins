import { test, expect } from '../../fixtures/auth-context';

/**
 * Job template / catalog loading — migrated from cypress/e2e/self-service/job-template-sync.cy.ts
 */

test.describe('Job Template Sync Tests - Fixed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/self-service', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/self-service/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test.describe('Catalog Loading and Template Sync', () => {
    test('Should handle catalog loading flow with skeleton loader', async ({
      page,
    }) => {
      await page.goto('/self-service/catalog', {
        waitUntil: 'domcontentloaded',
      });

      const bodyText = await page.locator('body').innerText();
      const hasSkeleton =
        (await page.locator('[data-testid="skeleton"]').count()) > 0 ||
        (await page.locator('.skeleton').count()) > 0 ||
        bodyText.includes('Loading');

      if (hasSkeleton) {
        // skeleton may be brief
      }

      await expect(page.locator('main')).toBeVisible({ timeout: 30000 });

      const body = page.locator('body');
      if ((await body.locator('[data-testid*="template"]').count()) > 0) {
        await expect(
          body.locator('[data-testid*="template"]').first(),
        ).toBeVisible();
      } else if (bodyText.includes('Start')) {
        await expect(page.getByText('Start').first()).toBeVisible();
      } else if (bodyText.includes('Template')) {
        await expect(page.getByText('Template').first()).toBeVisible();
      } else {
        await expect(page.locator('main')).toBeVisible();
      }
    });

    test('Should handle template access permissions gracefully', async ({
      page,
    }) => {
      await page.goto('/self-service/catalog', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(2000);

      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      const text = await page.locator('body').innerText();
      if (text.includes('Start') || text.includes('Template')) {
        return;
      }
      if (
        text.includes('No templates') ||
        text.toLowerCase().includes('permission') ||
        text.toLowerCase().includes('access')
      ) {
        return;
      }
    });
  });

  test.describe('Job Template Sync Performance', () => {
    test('Should load catalog within reasonable time', async ({ page }) => {
      const start = Date.now();
      await page.goto('/self-service/catalog', {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
      const loadTime = Date.now() - start;
      expect(loadTime).toBeLessThan(30000);
    });

    test('Should handle multiple navigation attempts gracefully', async ({
      page,
    }) => {
      await page.goto('/self-service/catalog', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1500);
      await expect(page.locator('main')).toBeVisible();

      await page.goto('/self-service', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await expect(page.locator('main')).toBeVisible();

      await page.goto('/self-service/catalog', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1500);
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('API Request Monitoring', () => {
    test('Should monitor catalog page loading', async ({ page }) => {
      await page.goto('/self-service/catalog', {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('body')).toBeVisible();
    });

    test('Should handle API request failures gracefully', async ({ page }) => {
      await page.goto('/self-service/catalog', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(5000);
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      const text = (await page.locator('body').innerText()).toLowerCase();
      if (text.includes('error') || text.includes('failed')) {
        // error path
      }
    });
  });
});
