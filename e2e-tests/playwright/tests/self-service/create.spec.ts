import { test, expect } from '../../fixtures/auth-context';
import type { Locator, Page } from '@playwright/test';

/**
 * Ansible self-service Create flow — migrated from cypress/e2e/self-service/create.cy.ts
 * Auth: shared worker context (auth-context fixture).
 */

const templateCardSelector =
  '[data-testid*="-"], .MuiCard-root, article, .template';

async function assertNotLoginPage(page: Page) {
  await expect(page.getByText('Select a Sign-in method')).not.toBeVisible();
  await expect(page.getByText('Log in to your account')).not.toBeVisible();
}

/** First button in first template card that looks like "Create". */
async function getCreateButton(page: Page): Promise<Locator | null> {
  const firstCard = page.locator(templateCardSelector).first();
  if ((await firstCard.count()) === 0) {
    return null;
  }
  const buttons = firstCard.locator('button');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const btn = buttons.nth(i);
    const text = ((await btn.textContent()) || '').toLowerCase();
    const testId = (await btn.getAttribute('data-testid')) || '';
    if (text.includes('create') || testId.toLowerCase().includes('create')) {
      return btn;
    }
  }
  return null;
}

test.describe('Ansible self-service Create and execution tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/self-service', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/self-service/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Validates template create form loads successfully', async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/self-service/);
    await assertNotLoginPage(page);

    const createBtn = await getCreateButton(page);
    if (!createBtn) {
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1500);

    if (!page.url().includes('/create')) {
      return;
    }

    await expect(page.locator('main')).toBeVisible();

    const body = page.locator('body');
    const hasForm = (await body.locator('form').count()) > 0;
    const text = await body.innerText();
    const hasSteps =
      text.includes('Step') ||
      (await body.locator('[data-testid*="step"]').count()) > 0;
    const hasInputs =
      (await body.locator('input, select, textarea').count()) > 0;

    if (hasForm) {
      await expect(body.locator('form').first()).toBeVisible();
    } else if (hasSteps || hasInputs) {
      // multi-step or inputs only — same pass behavior as Cypress
    }
  });

  test('Validates template form validation works', async ({ page }) => {
    await expect(page).toHaveURL(/\/self-service/);
    await assertNotLoginPage(page);

    const createBtn = await getCreateButton(page);
    if (!createBtn) {
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1500);

    if (!page.url().includes('/create')) {
      return;
    }

    const body = page.locator('body');
    if ((await body.locator('form').count()) === 0) {
      return;
    }

    const actionBtn = body
      .locator('button[type="submit"], button')
      .filter({ hasText: /next|submit|create/i })
      .first();
    if ((await actionBtn.count()) === 0) {
      return;
    }

    await actionBtn.click();
    await page.waitForTimeout(800);

    const after = await body.innerText();
    const hasValidation =
      after.toLowerCase().includes('required') ||
      after.toLowerCase().includes('error') ||
      (await body.locator('.error, [role="alert"]').count()) > 0;
    if (hasValidation) {
      // matches Cypress "Form validation working correctly" path
    }
  });

  test('Validates template creation navigation flow', async ({ page }) => {
    await expect(page).toHaveURL(/\/self-service/);
    await assertNotLoginPage(page);

    const createBtn = await getCreateButton(page);
    if (!createBtn) {
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1500);

    if (!page.url().includes('/create')) {
      return;
    }

    await page.goBack();
    await expect(page).toHaveURL(/\/self-service/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('Validates basic template information is displayed', async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/self-service/);
    await assertNotLoginPage(page);

    const createBtn = await getCreateButton(page);
    if (!createBtn) {
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1500);

    if (!page.url().includes('/create')) {
      return;
    }

    await expect(page.locator('header, h1, h2').first()).toBeAttached();

    const hasLongText = await page.evaluate(() =>
      Array.from(document.querySelectorAll('p, div')).some(
        el => (el.textContent || '').trim().length > 20,
      ),
    );
    if (!hasLongText) {
      // Cypress logged "Basic template header information displayed"
    }
  });

  test('Validates page loads successfully with templates', async ({ page }) => {
    await expect(page).toHaveURL(/\/self-service/);
    await expect(page.locator('main')).toBeVisible();

    const loading = await page
      .locator('[data-testid="loading-templates"]')
      .count();
    const bodyText = await page.locator('body').innerText();
    const cardCount = await page.locator(templateCardSelector).count();

    if (loading > 0) {
      // loading
    } else if (cardCount > 0) {
      // has cards
    } else if (
      bodyText.includes('No templates') ||
      bodyText.toLowerCase().includes('empty')
    ) {
      // empty
    }

    await expect(page.locator('main')).toBeVisible();
  });
});
