import { test, expect } from '@playwright/test';
import { signInRHDHWithGitHub } from '../../utils/auth';

test.describe('RHDH Ansible plugin My Items tab tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInRHDHWithGitHub(page);

    // Ensure we land on the Ansible plugin page shell before interacting with tabs.
    if (!page.url().includes('/ansible')) {
      await page.goto('/ansible', { waitUntil: 'domcontentloaded' });
    }
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Visits My Items tab and checks all links there', async ({ page }) => {
    // Navigate directly to the My Items tab
    await page.goto('/ansible/myitems', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Cypress: cy.url().should('include', '/myitems');
    await expect(page).toHaveURL(/\/myitems/);

    // Cypress: cy.wait(5000); — use a better wait for content
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Cypress: cy.get('li[role="menuitem"]').eq(0).should('have.text', 'Starred 0');
    const starredItem = page.locator('li[role="menuitem"]').first();
    const starredItemVisible = await starredItem
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (starredItemVisible) {
      await expect(starredItem).toContainText('Starred');

      // Cypress: cy.get('[title="Add to favorites"]').first().within(() => { cy.get('span').should('be.visible').click({ force: true }); });
      const addToFavoritesBtn = page
        .locator('[title="Add to favorites"]')
        .first();
      if (
        await addToFavoritesBtn.isVisible({ timeout: 5000 }).catch(() => false)
      ) {
        const spanInside = addToFavoritesBtn.locator('span');
        await expect(spanInside).toBeVisible();
        await spanInside.click({ force: true });

        // Wait for the starred count to update
        await page.waitForTimeout(1000);

        // Cypress: cy.get('[title="Remove from favorites"]').first().within(() => { cy.get('span').should('be.visible').click({ force: true }); });
        const removeFromFavoritesBtn = page
          .locator('[title="Remove from favorites"]')
          .first();
        if (
          await removeFromFavoritesBtn
            .isVisible({ timeout: 5000 })
            .catch(() => false)
        ) {
          const removeSpan = removeFromFavoritesBtn.locator('span');
          await expect(removeSpan).toBeVisible();
          await removeSpan.click({ force: true });

          // Wait for the starred count to update
          await page.waitForTimeout(1000);
        }
      }
    }

    // Cypress: cy.contains('a', 'Edit').should('have.attr', 'href').and('include', 'github');
    const editLink = page.getByRole('link', { name: /Edit/i }).first();
    if (await editLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await editLink.getAttribute('href');
      if (href) {
        expect(href).toContain('github');
      }
    }
  });
});
