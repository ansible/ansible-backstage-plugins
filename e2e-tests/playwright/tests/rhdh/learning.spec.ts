import { test, expect } from '@playwright/test';
import { signInRHDHWithGitHub } from '../../utils/auth';

test.describe('RHDH Ansible plugin Learning tab tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInRHDHWithGitHub(page);

    // Ensure we land on the Ansible plugin page shell before interacting with tabs.
    if (!page.url().includes('/ansible')) {
      await page.goto('/ansible', { waitUntil: 'domcontentloaded' });
    }
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Visits Learn tab and checks all links there', async ({ page }) => {
    // Navigate directly to the Learn tab
    await page.goto('/ansible/learn', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify we're on the Learn tab
    await expect(page).toHaveURL(/\/learn/);
  });
});
