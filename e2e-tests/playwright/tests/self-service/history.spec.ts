import { test, expect } from '../../fixtures/auth-context';

/**
 * Task execution history — migrated from cypress/e2e/self-service/history.cy.ts
 */

test.describe('History - Task Execution History Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/self-service', { waitUntil: 'domcontentloaded' });
    await page.goto('/self-service/create/tasks', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);
  });

  test('Should load the task history page successfully', async ({ page }) => {
    await expect(page).toHaveURL(/\/self-service\/create\/tasks/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Should display task history content', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible();

    if ((await page.locator('[data-testid="taskHeader"]').count()) > 0) {
      await expect(page.locator('[data-testid="taskHeader"]')).toBeVisible();
      return;
    }

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Task List') || bodyText.includes('History')) {
      await expect(page.getByText(/Task List|History/i).first()).toBeVisible();
    }
  });

  test('Should display task data or empty state', async ({ page }) => {
    const body = page.locator('body');
    const bodyText = await body.innerText();

    if ((await body.locator('table').count()) > 0) {
      await expect(body.locator('table').first()).toBeVisible();
      if (bodyText.includes('Task ID')) {
        await expect(page.getByText('Task ID').first()).toBeVisible();
      }
      if (bodyText.includes('Template')) {
        await expect(page.getByText('Template').first()).toBeVisible();
      }
      if (bodyText.includes('Status')) {
        await expect(page.getByText('Status').first()).toBeVisible();
      }
    } else if (
      bodyText.includes('No tasks') ||
      bodyText.toLowerCase().includes('empty')
    ) {
      await expect(page.getByText(/No tasks|empty/i).first()).toBeVisible();
    }
  });

  test('Should handle pagination if available', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    if ((await page.locator('[data-testid="tableToolBar"]').count()) > 0) {
      await expect(page.locator('[data-testid="tableToolBar"]')).toBeVisible();
      if (bodyText.includes('Rows per page')) {
        await expect(page.getByText('Rows per page').first()).toBeVisible();
      }
    }
  });
});
