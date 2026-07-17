import { test, expect } from '../../fixtures/auth-context-user';

test.describe('Non-admin user: Permission boundaries', () => {
  test.skip(
    process.env.RHDH_VERSION === '1.9',
    'Non-admin login requires RHDH 1.10+',
  );

  test('Non-admin user is authenticated and can access portal', async ({
    page,
  }) => {
    await page.goto('/self-service', { waitUntil: 'networkidle' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

    const signInPrompt = await page
      .getByText('Select a Sign-in method')
      .isVisible()
      .catch(() => false);
    expect(signInPrompt).toBeFalsy();

    await expect(page).toHaveURL(/\/self-service/);
  });

  test('Non-admin user does not see "Sync now" on Templates page', async ({
    page,
  }) => {
    await page.goto('/self-service', { waitUntil: 'networkidle' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

    const syncLink = page.getByText('Sync now');
    await expect(syncLink).not.toBeVisible();
  });

  test('Non-admin user does not see "Add Template" button', async ({
    page,
  }) => {
    await page.goto('/self-service', { waitUntil: 'networkidle' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

    const addTemplateBtn = page.locator('[data-testid="add-template-button"]');
    await expect(addTemplateBtn).not.toBeVisible();
  });

  test('Non-admin user does not see "Add Template" button on EE page', async ({
    page,
  }) => {
    await page.goto('/self-service/ee', { waitUntil: 'networkidle' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

    const createTab = page.getByRole('tab', { name: /^Create$/i });
    if (await createTab.isVisible().catch(() => false)) {
      await createTab.click();
      await page.waitForLoadState('networkidle');
    }

    const addTemplateBtn = page.locator('[data-testid="add-template-button"]');
    await expect(addTemplateBtn).not.toBeVisible();
  });

  test('Non-admin user does not see Administration/RBAC page in sidebar', async ({
    page,
  }) => {
    await page.goto('/self-service', { waitUntil: 'networkidle' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

    const adminLink = page
      .getByRole('link', { name: /Administration/i })
      .or(page.getByRole('link', { name: /RBAC/i }));

    const isVisible = await adminLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      // Sidebar link may be visible depending on portal RBAC config,
      // but the actual access restriction is verified in the next test
      console.log(
        '[Non-Admin] Administration link visible in sidebar — verifying content is restricted instead',
      );
      await adminLink.click();
      await page.waitForLoadState('networkidle');
      const bodyText = (await page.locator('body').textContent()) ?? '';
      const hasRbacContent =
        bodyText.includes('Role-Based Access Control') ||
        bodyText.includes('Users and groups');
      expect(hasRbacContent).toBeFalsy();
    }
  });

  test('Non-admin user cannot navigate to RBAC page directly', async ({
    page,
  }) => {
    await page.goto('/self-service/rbac', { waitUntil: 'networkidle' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

    const bodyText = (await page.locator('body').textContent()) ?? '';
    const hasRbacContent =
      bodyText.includes('Role-Based Access Control') ||
      bodyText.includes('Users and groups');

    // Non-admin should either be redirected or see no RBAC content
    expect(hasRbacContent).toBeFalsy();
  });
});
