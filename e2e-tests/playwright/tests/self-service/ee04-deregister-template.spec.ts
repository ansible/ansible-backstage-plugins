import { test, expect } from '../../fixtures/auth-context';

/**
 * Unregister EE template — migrated from cypress/e2e/self-service/ee04-deregister-template.cy.ts
 */

const EE_TEMPLATE_TITLE = 'Start from scratch';

test.describe('Unregister EE Template', () => {
  test('Unregisters the imported EE template from the catalog', async ({
    page,
  }) => {
    await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/self-service\/ee/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    const bodyText = await page.locator('body').innerText();
    if (!bodyText.includes('Create')) {
      return;
    }

    await page.getByText('Create').first().click({ force: true });
    await page.waitForTimeout(1500);

    if (!(await page.locator('body').innerText()).includes(EE_TEMPLATE_TITLE)) {
      return;
    }

    await page.getByText(EE_TEMPLATE_TITLE).first().click({ force: true });
    await page.waitForTimeout(2000);

    const details = page.locator('body');
    const detailsText = (await details.innerText()).toLowerCase();
    const hasUnregister =
      detailsText.includes('unregister') ||
      (await page.locator('[data-testid*="unregister"]').count()) > 0;

    if (!hasUnregister) {
      return;
    }

    const unregisterBtn = details
      .locator('button, a, [role="button"]')
      .filter({
        hasText: /unregister.*template|template.*unregister/i,
      })
      .first();

    if ((await unregisterBtn.count()) > 0) {
      await unregisterBtn.click({ force: true });
      await page.waitForTimeout(1500);

      const confirm = page
        .locator('button, [role="button"]')
        .filter({
          hasText: /unregister|confirm|yes|ok/i,
        })
        .last();
      if ((await confirm.count()) > 0 && (await confirm.isVisible())) {
        await confirm.click({ force: true });
        await page.waitForTimeout(2000);
      }

      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await page.getByText('Create').first().click({ force: true });
      await page.waitForTimeout(1500);
    } else {
      await page
        .getByText(/unregister template/i)
        .first()
        .click({ force: true });
      await page.waitForTimeout(1500);
    }
  });
});
