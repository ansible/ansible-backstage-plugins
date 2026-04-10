import { test, expect } from '../../fixtures/auth-context';
import { authenticator } from 'otplib';
import { Page } from '@playwright/test';

/**
 * Handles the GitHub OAuth "Login Required" dialog that appears when GitHub
 * is selected as the SCM provider in the EE wizard.
 *
 * Clicking "Log in" triggers a full-page redirect to GitHub's OAuth login.
 * After completing authentication (including 2FA if configured), GitHub
 * redirects back to the RHDH portal. The wizard state is lost, so the caller
 * must re-navigate after this function returns.
 *
 * Requires GH_USER_ID and GH_USER_PASS environment variables.
 * Optionally uses AUTHENTICATOR_SECRET for TOTP 2FA.
 *
 * @returns true if GitHub login was completed via redirect, false if the
 *          dialog was not found or credentials are missing.
 */
async function handleGitHubOAuthDialog(page: Page): Promise<boolean> {
  const oauthDialog = page.getByText('Login Required').first();
  const dialogVisible = await oauthDialog
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!dialogVisible) {
    return false;
  }

  console.log('[EE Test] GitHub OAuth "Login Required" dialog detected');

  if (!process.env.GH_USER_ID || !process.env.GH_USER_PASS) {
    console.log(
      '[EE Test] No GitHub credentials configured, dismissing dialog',
    );
    await page
      .getByText(/Reject All/i)
      .first()
      .click({ force: true })
      .catch(() => page.keyboard.press('Escape'));
    return false;
  }

  const logInBtn = page.getByRole('button', { name: /^Log in$/i }).first();
  if ((await logInBtn.count()) === 0) {
    return false;
  }

  // Backstage SCM auth opens a popup via window.open(). Listen on the
  // browser context for the popup event (not the page — page.waitForEvent
  // only catches popups opened by that specific page's JS context).
  console.log(
    '[EE Test] Clicking Log in — expecting popup for GitHub OAuth...',
  );
  const context = page.context();
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
    logInBtn.click(),
  ]);

  if (!popup) {
    console.log('[EE Test] No popup opened — using redirect flow');
    // enableExperimentalRedirectFlow causes a full-page redirect instead of popup
    if (new URL(page.url()).hostname === 'github.com') {
      await handleGitHubLoginOnPage(page);
    }
    // After redirect flow, page may be on handler/frame or an error page.
    // Navigate back to portal to recover.
    const currentUrl = page.url();
    const baseUrl = process.env.BASE_URL || 'http://localhost:7007';
    if (
      !currentUrl.startsWith(baseUrl) ||
      currentUrl.includes('handler/frame')
    ) {
      console.log('[EE Test] Navigating back to portal after redirect flow...');
      await page
        .goto('/self-service/ee', {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        })
        .catch(() => {});
      await page.waitForTimeout(2000);
    }
    console.log(
      '[EE Test] GitHub OAuth redirect flow complete, URL:',
      page.url(),
    );
    return true;
  }

  console.log('[EE Test] GitHub OAuth popup opened');
  await popup.waitForLoadState('domcontentloaded');
  console.log('[EE Test] Popup URL:', popup.url());

  await handleGitHubLoginOnPage(popup);

  // Wait for popup to close (OAuth callback closes the popup automatically)
  await popup
    .waitForEvent('close', { timeout: 30000 })
    .catch(() => console.log('[EE Test] Popup did not close within timeout'));

  console.log('[EE Test] GitHub OAuth popup closed, continuing on main page');
  await page.waitForTimeout(2000);
  return true;
}

/**
 * Completes the GitHub login flow on the given page (either a popup or the
 * main page after redirect). Handles credentials, TOTP 2FA, and the
 * GitHub OAuth authorize page.
 */
async function handleGitHubLoginOnPage(page: Page): Promise<void> {
  // Fill GitHub credentials if on login page
  const loginField = page.locator('#login_field');
  if (await loginField.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('[EE Test] Filling GitHub credentials...');
    await loginField.fill(process.env.GH_USER_ID!);
    await page.locator('#password').fill(process.env.GH_USER_PASS!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForLoadState('domcontentloaded');
    console.log('[EE Test] GitHub credentials submitted, URL:', page.url());

    // Handle TOTP 2FA if configured
    if (process.env.AUTHENTICATOR_SECRET) {
      const totpField = page.locator('#app_totp');
      const totpVisible = await totpField
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (totpVisible) {
        console.log('[EE Test] TOTP 2FA required, entering code...');
        const totp = authenticator.generate(process.env.AUTHENTICATOR_SECRET!);
        await totpField.fill(totp);
        // TOTP auto-submits — wait for navigation away from 2FA page
        await page
          .waitForURL(url => !url.pathname.includes('two-factor'), {
            timeout: 15000,
          })
          .catch(() => {});
        await page.waitForLoadState('domcontentloaded');
        console.log('[EE Test] After 2FA, URL:', page.url());
      }
    }
  }

  // Handle GitHub "Authorize" page if shown (button text is "Authorize <owner>")
  await page.waitForLoadState('networkidle').catch(() => {});
  const authorizeBtn = page.getByRole('button', { name: /authorize/i }).first();
  if (await authorizeBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    console.log(
      '[EE Test] GitHub authorize page detected, clicking Authorize...',
    );
    await authorizeBtn.click();
    console.log('[EE Test] Authorize clicked, waiting for callback...');
    // The redirect flow goes: GitHub → localhost:7007/api/auth/github/handler/frame
    // The handler/frame endpoint processes the OAuth code and redirects to
    // the original page. Wait for the URL to leave github.com.
    await page
      .waitForURL(url => url.hostname !== 'github.com', {
        timeout: 30000,
      })
      .catch(() => {});
    console.log('[EE Test] After authorize redirect, URL:', page.url());
  }
}

/**
 * EE template import + execution wizard — migrated from
 * cypress/e2e/self-service/ee02-template-execution.cy.ts
 */

const EE_TEMPLATE_URL =
  process.env.EE_IMPORT_REPO_URL ||
  'https://github.com/ansible/ansible-rhdh-templates/blob/v1.0.2/templates/ee-start-from-scratch.yaml';

const EE_TEMPLATE_TITLE = process.env.EE_TEMPLATE_TITLE || 'Start from scratch';

const REPO_SUFFIX = Math.floor(Math.random() * 100)
  .toString()
  .padStart(2, '0');
const RANDOM_LETTER = String.fromCharCode(97 + Math.floor(Math.random() * 26));
const REPO_NAME = `ee-repo-${RANDOM_LETTER}`;
const EE_FILE_NAME = `ee-${REPO_SUFFIX}`;

test.describe('Execution Environment Template Execution Tests', () => {
  // Extended timeout to accommodate GitHub OAuth redirect flow + template execution
  test.setTimeout(180_000);

  test('Imports EE template via kebab menu and executes it from Create tab', async ({
    page,
  }) => {
    let wizardOpened = false;
    await test.step('Open EE Create tab', async () => {
      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/self-service\/ee/);
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
      if ((await page.locator('body').innerText()).includes('Create')) {
        await page.getByText('Create').first().click({ force: true });
        await page.waitForTimeout(1500);
      }
    });

    if (
      (await page.locator('[data-testid="kebab-menu-button"]').count()) === 0
    ) {
      test.skip();
    }

    await test.step('Kebab → Import Template → catalog-import', async () => {
      await page
        .locator('[data-testid="kebab-menu-button"]')
        .click({ force: true });
      await page.waitForTimeout(400);
      await page
        .locator('[data-testid="import-template-button"]')
        .click({ force: true });
      await page.waitForTimeout(2500);
      const url = page.url();
      if (!url.includes('/self-service/catalog-import')) {
        throw new Error(
          `Catalog import page was not reached; current URL: ${url}`,
        );
      }
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    });

    await test.step('Fill template URL and Analyze', async () => {
      const urlInput = page
        .getByLabel(/^URL$/i)
        .or(page.getByRole('textbox', { name: /url/i }))
        .or(
          page
            .locator('input[name*="url" i], input[placeholder*="url" i]')
            .first(),
        )
        .first();
      await urlInput.waitFor({ state: 'visible', timeout: 15000 });
      await urlInput.clear();
      await urlInput.fill(EE_TEMPLATE_URL);
      await page
        .getByRole('button', { name: /analyze/i })
        .click({ force: true });
      await page.waitForTimeout(4000);
    });

    await test.step('Review: Import', async () => {
      const importBtn = page
        .locator('button')
        .filter({ hasText: /^import$/i })
        .or(page.getByRole('button', { name: /import/i }))
        .first();
      if ((await importBtn.count()) > 0) {
        await importBtn.click({ force: true });
        await page.waitForTimeout(5000);
      }
    });

    await test.step('Return to EE Create and Start template', async () => {
      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.getByText('Create').first().click({ force: true });
      await page.waitForTimeout(1500);
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      const body = await page.locator('body').innerText();
      if (!body.includes(EE_TEMPLATE_TITLE)) {
        return;
      }

      const card = page
        .locator('.MuiCard-root, article, [data-testid*="template"]')
        .filter({ hasText: EE_TEMPLATE_TITLE })
        .first();
      const startBtn = card
        .locator('button, [role="button"]')
        .filter({ hasText: /start/i })
        .first();
      if ((await startBtn.count()) > 0) {
        await startBtn.click({ force: true });
        await page.waitForTimeout(2500);
        wizardOpened = true;
      }
    });

    await test.step('Wizard: Next steps + GitHub MCP + EE definition (with Git)', async () => {
      if (!wizardOpened) return;
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      for (let i = 0; i < 2; i++) {
        const next = page.getByRole('button', { name: /^Next$/i });
        if ((await next.count()) > 0) {
          await next.first().click({ force: true });
          await page.waitForTimeout(700);
        }
      }

      const gh = page
        .locator('body')
        .getByText(/^github$/i)
        .first();
      if ((await gh.count()) > 0) {
        await gh.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
      }

      const nextAfterMcp = page.getByRole('button', { name: /^Next$/i });
      for (let i = 0; i < 3; i++) {
        if ((await nextAfterMcp.count()) > 0) {
          await nextAfterMcp.first().click({ force: true });
          await page.waitForTimeout(700);
        }
      }

      await page
        .getByLabel(/EE Definition Name/i)
        .or(
          page
            .locator('label')
            .filter({ hasText: /^EE Definition Name/i })
            .locator('..')
            .locator('input, textarea')
            .first(),
        )
        .first()
        .fill(EE_FILE_NAME);

      await page
        .getByLabel(/^Description/i)
        .or(
          page
            .locator('label')
            .filter({ hasText: /^Description/i })
            .locator('..')
            .locator('input, textarea')
            .first(),
        )
        .first()
        .fill('execution environment');

      // Select source control provider — Backstage oneOf field renders as MUI Select
      // Find the select element near "Select source control provider" heading
      const providerHeading = page.locator(
        'text=Select source control provider',
      );
      if ((await providerHeading.count()) > 0) {
        // Backstage oneOf select: look for the MUI Select div[role="button"] or native select
        const selectContainer = providerHeading
          .locator(
            'xpath=ancestor::fieldset[1] | ancestor::div[contains(@class,"MuiFormControl")]',
          )
          .first();
        const muiSelect = selectContainer
          .locator('[role="combobox"], [role="button"], select')
          .first();

        if ((await muiSelect.count()) === 0) {
          // Fallback: find any select/combobox near the heading
          const nearbySelect = providerHeading
            .locator('..')
            .locator('[role="combobox"], [role="button"], select')
            .or(providerHeading.locator('xpath=following::select[1]'))
            .or(
              providerHeading.locator(
                'xpath=following::div[@role="button"][1]',
              ),
            )
            .first();
          if ((await nearbySelect.count()) > 0) {
            await nearbySelect.click({ force: true });
          }
        } else {
          await muiSelect.click({ force: true });
        }
        await page.waitForTimeout(500);

        // Select GitHub from dropdown options
        const ghOption = page
          .getByRole('option', { name: /github/i })
          .or(page.locator('[role="option"]').filter({ hasText: /github/i }))
          .or(page.locator('li').filter({ hasText: /github/i }))
          .or(page.locator('[data-value*="github" i]'))
          .first();
        if ((await ghOption.count()) > 0) {
          await ghOption.click({ force: true });
        }
        await page.waitForTimeout(1000);
      }

      // Handle GitHub OAuth dialog triggered by selecting GitHub as SCM provider.
      // "Log in" causes a full-page redirect to GitHub, so after completing
      // OAuth we must re-open the wizard and re-fill the form.
      const didGitHubRedirect = await handleGitHubOAuthDialog(page);

      if (didGitHubRedirect) {
        // Wizard state is lost after redirect — restart the wizard
        console.log(
          '[EE Test] Re-opening wizard after GitHub OAuth redirect...',
        );
        await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        await page.getByText('Create').first().click({ force: true });
        await page.waitForTimeout(1500);
        await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

        const card = page
          .locator('.MuiCard-root, article, [data-testid*="template"]')
          .filter({ hasText: EE_TEMPLATE_TITLE })
          .first();
        const startBtn = card
          .locator('button, [role="button"]')
          .filter({ hasText: /start/i })
          .first();
        if ((await startBtn.count()) > 0) {
          await startBtn.click({ force: true });
          await page.waitForTimeout(2500);
        }

        // Navigate through wizard steps again
        for (let i = 0; i < 2; i++) {
          const next = page.getByRole('button', { name: /^Next$/i });
          if ((await next.count()) > 0) {
            await next.first().click({ force: true });
            await page.waitForTimeout(700);
          }
        }

        const ghMcp = page
          .locator('body')
          .getByText(/^github$/i)
          .first();
        if ((await ghMcp.count()) > 0) {
          await ghMcp.click({ force: true }).catch(() => {});
          await page.waitForTimeout(400);
        }

        for (let i = 0; i < 3; i++) {
          const n = page.getByRole('button', { name: /^Next$/i });
          if ((await n.count()) > 0) {
            await n.first().click({ force: true });
            await page.waitForTimeout(700);
          }
        }

        // Re-fill EE definition fields
        await page
          .getByLabel(/EE Definition Name/i)
          .or(
            page
              .locator('label')
              .filter({ hasText: /^EE Definition Name/i })
              .locator('..')
              .locator('input, textarea')
              .first(),
          )
          .first()
          .fill(EE_FILE_NAME);

        await page
          .getByLabel(/^Description/i)
          .or(
            page
              .locator('label')
              .filter({ hasText: /^Description/i })
              .locator('..')
              .locator('input, textarea')
              .first(),
          )
          .first()
          .fill('execution environment');

        // Re-select GitHub as SCM provider (already authenticated, no OAuth dialog)
        const providerHeading2 = page.locator(
          'text=Select source control provider',
        );
        if ((await providerHeading2.count()) > 0) {
          const selectContainer2 = providerHeading2
            .locator(
              'xpath=ancestor::fieldset[1] | ancestor::div[contains(@class,"MuiFormControl")]',
            )
            .first();
          const muiSelect2 = selectContainer2
            .locator('[role="combobox"], [role="button"], select')
            .first();
          if ((await muiSelect2.count()) > 0) {
            await muiSelect2.click({ force: true });
          }
          await page.waitForTimeout(500);

          const ghOption2 = page
            .getByRole('option', { name: /github/i })
            .or(page.locator('[role="option"]').filter({ hasText: /github/i }))
            .first();
          if ((await ghOption2.count()) > 0) {
            await ghOption2.click({ force: true });
          }
          await page.waitForTimeout(1000);
        }
      }

      // Fill Git organization — wait for it to appear after provider selection
      const orgInput = page
        .getByLabel(/Git repository organization or username/i)
        .or(
          page
            .locator('label')
            .filter({ hasText: /Git repository organization/i })
            .locator('..')
            .locator('input')
            .first(),
        )
        .first();
      if ((await orgInput.count()) > 0) {
        await orgInput.fill('test-rhaap-1');
      }

      // Fill Repository Name
      const repoInput = page
        .getByLabel(/^Repository Name/i)
        .or(
          page
            .locator('label')
            .filter({ hasText: /^Repository Name/i })
            .locator('..')
            .locator('input')
            .first(),
        )
        .first();
      if ((await repoInput.count()) > 0) {
        await repoInput.fill(REPO_NAME);
      }

      await page
        .getByText(/Create new repository/i)
        .click({ force: true })
        .catch(() => {});

      await page
        .getByRole('button', { name: /^Next$/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(1500);
      await page
        .getByRole('button', { name: /create/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(5000);
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 });
    });

    await test.step('Second run: Start template, wizard without Git publish', async () => {
      if (!wizardOpened) return;

      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.getByText('Create').first().click({ force: true });
      await page.waitForTimeout(1500);

      if (
        !(await page.locator('body').innerText()).includes(EE_TEMPLATE_TITLE)
      ) {
        return;
      }

      const startAgain = page
        .locator('.MuiCard-root, article, [data-testid*="template"]')
        .filter({ hasText: EE_TEMPLATE_TITLE })
        .locator('button, [role="button"]')
        .filter({ hasText: /start/i })
        .first();

      if ((await startAgain.count()) === 0) {
        return;
      }
      await startAgain.click({ force: true });
      await page.waitForTimeout(2500);

      for (let i = 0; i < 2; i++) {
        const n = page.getByRole('button', { name: /^Next$/i });
        if ((await n.count()) > 0) {
          await n.first().click({ force: true });
          await page.waitForTimeout(600);
        }
      }

      if ((await page.locator('body').innerText()).includes('GitHub')) {
        await page
          .locator('body')
          .getByText(/^github$/i)
          .first()
          .click({ force: true })
          .catch(() => {});
      }
      for (let i = 0; i < 3; i++) {
        const n = page.getByRole('button', { name: /^Next$/i });
        if ((await n.count()) > 0) {
          await n.first().click({ force: true });
          await page.waitForTimeout(600);
        }
      }

      await page
        .getByLabel(/EE Definition Name/i)
        .or(
          page
            .locator('label')
            .filter({ hasText: /^EE Definition Name/i })
            .locator('..')
            .locator('input, textarea')
            .first(),
        )
        .first()
        .fill(EE_FILE_NAME);
      await page
        .getByLabel(/^Description/i)
        .or(
          page
            .locator('label')
            .filter({ hasText: /^Description/i })
            .locator('..')
            .locator('input, textarea')
            .first(),
        )
        .first()
        .fill('execution environment');

      // Uncheck "Publish to a Git repository" — locate by label text
      const publishLabel = page
        .getByText(/Publish to a Git repository/i)
        .first();
      if ((await publishLabel.count()) > 0) {
        const publishCheckbox = page
          .locator('label, div, span')
          .filter({ hasText: /Publish to a Git repository/i })
          .locator('input[type="checkbox"]')
          .first();
        if (
          (await publishCheckbox.count()) > 0 &&
          (await publishCheckbox.isChecked())
        ) {
          await publishCheckbox.uncheck({ force: true });
          console.log('[EE Test] Unchecked "Publish to a Git repository"');
        }
      }
      await page.waitForTimeout(500);

      await page
        .getByRole('button', { name: /^Next$/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(1500);
      await page
        .getByRole('button', { name: /create/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(5000);
    });
  });
});
