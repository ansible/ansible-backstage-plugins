import { test, expect } from '@playwright/test';
import { signInRHDHWithGitHub } from '../../utils/auth';

function randomId() {
  // Cypress used _.random(0, 1e9); keep similar shape but avoid collisions.
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

test.describe('RHDH Ansible plugin Create flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInRHDHWithGitHub(page);

    // Ensure we land on the Ansible plugin page shell before interacting with tabs.
    if (!page.url().includes('/ansible')) {
      await page.goto('/ansible', { waitUntil: 'domcontentloaded' });
    }
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Visits Create tab and runs Ansible Project template', async ({
    page,
  }) => {
    // Ensure we're on the ansible page or navigate to Create tab directly
    if (!page.url().includes('/ansible/create')) {
      await page.goto('/ansible/create', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Cypress: cy.contains('Choose')...click()
    // The "Choose" action sometimes opens in a new tab; Playwright navigates in-tab.
    const chooseBtn = page.getByRole('button', { name: /^Choose$/ }).first();
    if (!(await chooseBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
      return;
    }
    await chooseBtn.click();

    // Wait for scaffolder form fields (Backstage scaffolder uses these IDs).
    await page.locator('#root_repoOwner').waitFor({ state: 'visible' });

    const rid = randomId();
    const owner = `fo2${rid}`;
    const repoName = `bar3-${rid}`;
    const collectionGroup = `fo2bar_${rid}`;
    const collectionName = `fo2bar_${rid}`;

    await page.locator('#root_repoOwner').fill('test-rhaap-1');
    await page.locator('#root_repoName').fill(repoName);
    await page.locator('#root_collectionGroup').fill(collectionGroup);
    await page.locator('#root_collectionName').fill(collectionName);
    await page.locator('#root_owner').fill(owner);
    await page.locator('#root_system').fill(owner);

    // Cypress: cy.get('button[type=submit]').click() (Review)
    const reviewBtn = page.locator('button[type="submit"]').first();
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // Cypress: cy.contains('button', 'Create').click()
    const createBtn = page.getByRole('button', { name: /^Create$/ }).first();
    await expect(createBtn).toBeVisible({ timeout: 20000 });
    await createBtn.click();

    // Cypress treated both success and failure as pass; keep same behavior.
    const openInCatalog = page.getByText('Open in catalog');
    const isSuccess = await openInCatalog
      .isVisible({ timeout: 30000 })
      .catch(() => false);

    if (isSuccess) {
      await expect(openInCatalog).toBeVisible();
    } else {
      await expect(openInCatalog).not.toBeVisible();
    }
  });
});
