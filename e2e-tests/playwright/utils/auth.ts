import { expect, Page } from '@playwright/test';
import { authenticator } from 'otplib';

/**
 * Authentication utilities for Playwright E2E tests
 * Migrated from Cypress common.ts with improvements
 */

/**
 * Clicks Sign In for the RH AAP provider.
 * Handles both multi-provider (listitem with "RH AAP") and single-provider layouts.
 */
export async function clickRhaapSignIn(page: Page) {
  // Multi-provider: listitem scoped button (avoids strict-mode violations)
  const rhaapItem = page
    .getByRole('listitem')
    .filter({ hasText: /RH AAP|Ansible Automation Platform/i })
    .getByRole('button', { name: /^Sign In$/ });

  if (await rhaapItem.isVisible({ timeout: 5000 }).catch(() => false)) {
    await rhaapItem.click();
    return;
  }

  // Single provider or different layout: click any visible Sign In button
  console.log(
    '[Auth] RH AAP listitem not found, trying generic Sign In button...',
  );
  const signInBtn = page.getByRole('button', { name: /Sign In/i }).first();
  if (await signInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await signInBtn.click();
    return;
  }

  // Last resort: click any element containing "Sign In"
  console.log('[Auth] No Sign In button found, trying text match...');
  await page
    .getByText(/Sign In/i)
    .first()
    .click();
}

/**
 * Login to AAP portal
 * Replaces the Cypress Common.LogintoAAP() with smarter auto-waiting
 */
export async function loginAAP(page: Page) {
  console.log('[Auth] Starting login process...');

  // Navigate to home page
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  console.log('[Auth] Navigated to home page:', page.url());

  // Wait for main content to load
  await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

  // Check if we need to sign in
  const signInMethodVisible = await page
    .getByText('Select a Sign-in method')
    .isVisible()
    .catch(() => false);

  if (!signInMethodVisible) {
    const url = page.url();
    if (
      url.includes('/self-service') &&
      (await page
        .locator('main')
        .isVisible()
        .catch(() => false))
    ) {
      console.log('[Auth] Already authenticated (self-service) ✓');
      return;
    }
    console.log(
      '[Auth] Already logged in, checking for Templates navigation...',
    );
    const hasTemplates = await page
      .getByText('Templates', { exact: true })
      .first()
      .isVisible()
      .catch(() => false);

    if (hasTemplates) {
      console.log('[Auth] Already authenticated ✓');
      return;
    }
    console.log('[Auth] Not on login page but not authenticated either');
  }

  // Check if portal auto-redirected to AAP login page (single-provider setup)
  const alreadyOnLoginPage = await page
    .getByText('Log in to your account')
    .isVisible()
    .catch(() => false);

  let loginPageVisible: boolean;

  if (alreadyOnLoginPage) {
    console.log(
      '[Auth] Already on AAP login page (auto-redirect from single provider)',
    );
    loginPageVisible = true;
  } else {
    console.log('[Auth] Clicking RH AAP Sign In button...');
    await clickRhaapSignIn(page);

    // Wait a moment for navigation (like Cypress wait)
    await page.waitForLoadState('domcontentloaded');
    console.log('[Auth] After Sign In click, URL:', page.url());

    // Wait for AAP login page to load
    loginPageVisible = await page
      .getByText('Log in to your account')
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
  }

  if (loginPageVisible) {
    console.log('[Auth] AAP login page loaded, filling credentials...');

    // Fill in credentials
    await page.locator('#pf-login-username-id').fill(process.env.AAP_USER_ID!);
    await page
      .locator('#pf-login-password-id')
      .fill(process.env.AAP_USER_PASS!);

    // Optional: Toggle password visibility (like Cypress test does)
    const showPasswordButton = page.getByLabel('Show password');
    if (await showPasswordButton.isVisible().catch(() => false)) {
      await showPasswordButton.click();
      await page.getByLabel('Hide password').click();
    }

    console.log('[Auth] Clicking Log in button...');
    // Click login button
    await page.getByRole('button', { name: 'Log in' }).click();

    // Wait a moment for navigation
    await page.waitForLoadState('domcontentloaded');
    console.log('[Auth] After Log in click, URL:', page.url());

    // Check for AAP OAuth authorization page
    const aapAuthorizeVisible = await page
      .getByText(/Authorize.*\?/)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (aapAuthorizeVisible) {
      console.log(
        '[Auth] AAP OAuth authorization page detected, clicking Authorize...',
      );
      await page.getByRole('button', { name: 'Authorize' }).click();
      console.log('[Auth] Clicked Authorize button');
    }

    // Wait for OAuth redirect back to portal - match actual hostname, not query params
    console.log('[Auth] Waiting for OAuth callback redirect...');
    const baseUrl = new URL(process.env.BASE_URL || 'http://localhost:7007');
    await page.waitForURL(url => url.hostname === baseUrl.hostname, {
      timeout: 30000,
    });
    console.log('[Auth] After login redirect, URL:', page.url());

    // Wait for page to fully load after OAuth callback
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Check for Backstage authorization page (different from AAP auth)
    await page.waitForTimeout(1000);

    const authorizeVisible = await page
      .getByText('Authorize Ansible Automation Experience App')
      .isVisible()
      .catch(() => false);

    if (authorizeVisible) {
      console.log(
        '[Auth] Backstage authorization page detected, clicking Authorize...',
      );
      await page.getByRole('button', { name: 'Authorize' }).click();
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      console.log('[Auth] After Backstage authorize, URL:', page.url());
    }
  }

  // Wait for page to settle after auth flow
  await page.waitForTimeout(1000);

  console.log('[Auth] Current URL after auth:', page.url());

  const signInPromptVisible = await page
    .getByText('Select a Sign-in method')
    .isVisible()
    .catch(() => false);

  // OAuth often lands on /self-service/catalog (or similar) — treat as logged in
  // when main is visible and the sign-in gate is not shown (label may not be "Templates" on all routes)
  const url = page.url();
  const onSelfService = url.includes('/self-service');
  const mainVisible = await page
    .locator('main')
    .isVisible()
    .catch(() => false);

  if (onSelfService && mainVisible && !signInPromptVisible) {
    console.log('[Auth] Authenticated on self-service app ✓');
    return;
  }

  const hasTemplatesNav = await page
    .getByText('Templates', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);

  if (hasTemplatesNav) {
    console.log(
      '[Auth] Already on authenticated page with Templates navigation ✓',
    );
    return;
  }

  console.log('[Auth] Navigating to home to verify authentication...');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  console.log('[Auth] Final URL:', page.url());

  console.log(
    '[Auth] Waiting for Templates navigation or self-service shell...',
  );
  const templatesOrShell = page
    .getByText('Templates', { exact: true })
    .first()
    .or(page.getByRole('link', { name: /templates/i }))
    .or(page.locator('[href*="/self-service"]'))
    .first();
  await templatesOrShell.waitFor({ state: 'visible', timeout: 20000 });

  console.log('[Auth] Login successful ✓');
}

/**
 * Login to AAP with session caching
 * Similar to Cypress cy.session() but with Playwright's storage state
 */
export async function loginAAPWithSession(page: Page) {
  const storageStatePath = 'playwright/.auth/user.json';

  // Try to use existing session
  try {
    // Check if session file exists and load it
    await page.context().storageState({ path: storageStatePath });

    // Verify session is still valid
    await page.goto('/');
    const isLoggedIn = await page
      .getByRole('banner')
      .getByText('Templates')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isLoggedIn) {
      // Session is valid, no need to login
      return;
    }
  } catch {
    // Session doesn't exist or is invalid, continue with login
  }

  // Perform login
  await loginAAP(page);

  // Save session state for reuse
  await page.context().storageState({ path: storageStatePath });
}

/**
 * Login to GitLab with optional 2FA
 */
export async function loginGitLab(page: Page) {
  await page.goto('https://gitlab.com/users/sign_in');

  await page.locator('#user_login').waitFor({ state: 'visible' });
  await page.locator('#user_password').waitFor({ state: 'visible' });

  await page.locator('#user_login').fill(process.env.GL_USER_ID!);
  await page.locator('#user_password').fill(process.env.GL_USER_PASS!);

  await page
    .locator(
      '[data-testid="sign-in-button"], input[type="submit"][value="Sign in"], button[type="submit"]',
    )
    .first()
    .click();

  await page.waitForLoadState('domcontentloaded');

  // Handle 2FA if required
  if (process.env.GL_AUTHENTICATOR_SECRET) {
    const totpField = page.locator('#user_otp_attempt');
    const totpVisible = await totpField
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (totpVisible) {
      const totp = authenticator.generate(process.env.GL_AUTHENTICATOR_SECRET!);
      await totpField.fill(totp);
      await page
        .locator('input[type="submit"], button[type="submit"]')
        .first()
        .click();
      await page.waitForLoadState('domcontentloaded');
    }
  }
}

/**
 * Click a Cloudflare Turnstile widget by locating its container and clicking
 * at the checkbox position. Returns true if a widget was found and clicked.
 */
export async function clickTurnstileWidget(page: Page): Promise<boolean> {
  const widgetBox = await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of Array.from(iframes)) {
      const title = iframe.getAttribute('title') || '';
      const src = iframe.getAttribute('src') || '';
      if (
        title.includes('Cloudflare') ||
        title.includes('challenge') ||
        src.includes('challenges.cloudflare') ||
        src.includes('turnstile')
      ) {
        const rect = iframe.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            via: 'iframe',
          };
        }
      }
    }
    const cfInputs = document.querySelectorAll(
      'input[name="cf-turnstile-response"]',
    );
    for (const input of Array.from(cfInputs)) {
      let el: HTMLElement | null = input.parentElement;
      while (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width >= 30 && rect.height >= 30) {
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            via: 'cf-input',
          };
        }
        el = el.parentElement;
      }
    }
    const containers = document.querySelectorAll('div[style*="display: grid"]');
    for (const container of Array.from(containers)) {
      const rect = container.getBoundingClientRect();
      if (rect.width >= 200 && rect.height >= 50) {
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          via: 'grid-div',
        };
      }
    }
    return null;
  });

  if (!widgetBox) return false;

  const clickX = widgetBox.x + 30;
  const clickY = widgetBox.y + widgetBox.height / 2;
  console.log(
    `[Auth] Turnstile (${widgetBox.via}) at (${widgetBox.x}, ${widgetBox.y}), ` +
      `size ${widgetBox.width}x${widgetBox.height}, clicking at (${clickX}, ${clickY})`,
  );
  await page.mouse.click(clickX, clickY);
  await page.waitForTimeout(3000);
  return true;
}

/**
 * Handle Cloudflare "Performing security verification" challenge page.
 */
export async function handleSecurityVerification(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);

  const hasVerifyText = await page
    .getByText(/Performing security verification/i)
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (!hasVerifyText) return;

  console.log('[Auth] Security verification detected, waiting...');
  await page.waitForTimeout(2000);

  for (let attempt = 0; attempt < 10; attempt++) {
    if (await clickTurnstileWidget(page)) {
      console.log('[Auth] Turnstile clicked, waiting for page to update...');
      await page.waitForTimeout(3000);
      return;
    }
    console.log(`[Auth] Attempt ${attempt + 1}/10 — widget not clickable yet`);
    await page.waitForTimeout(1000);
  }

  console.log('[Auth] Turnstile not resolved after 10 attempts, proceeding...');
}

/**
 * Handle GitLab login on the current page — Turnstile challenges, credentials,
 * TOTP 2FA, and Authorize page. Works for both popup and redirect OAuth flows.
 */
export async function handleGitLabLoginOnPage(page: Page): Promise<void> {
  for (let round = 0; round < 5; round++) {
    console.log(`[Auth] GitLab login round ${round + 1}, URL:`, page.url());

    if (new URL(page.url()).hostname !== 'gitlab.com') {
      console.log('[Auth] Left GitLab, login complete');
      return;
    }

    await handleSecurityVerification(page);

    const hasLoginForm = await page
      .locator('#user_login')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasTOTP = await page
      .locator('#user_otp_attempt')
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasTOTP && process.env.GL_AUTHENTICATOR_SECRET) {
      console.log('[Auth] TOTP 2FA required, entering code...');
      const totp = authenticator.generate(process.env.GL_AUTHENTICATOR_SECRET!);
      await page.locator('#user_otp_attempt').fill(totp);
      const totpSubmit = page
        .locator('input[type="submit"], button[type="submit"]')
        .first();
      await Promise.all([
        page
          .waitForURL(/.*/, { waitUntil: 'domcontentloaded', timeout: 15000 })
          .catch(() => {}),
        totpSubmit.click(),
      ]);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(3000);
      console.log('[Auth] After 2FA submit, URL:', page.url());
      continue;
    }

    if (hasLoginForm) {
      console.log('[Auth] Filling GitLab credentials...');
      await page.locator('#user_login').fill(process.env.GL_USER_ID!);
      await page.locator('#user_password').fill(process.env.GL_USER_PASS!);
      const submitBtn = page
        .locator(
          '[data-testid="sign-in-button"], input[type="submit"][value="Sign in"], button[type="submit"]',
        )
        .first();
      await Promise.all([
        page
          .waitForURL(/.*/, { waitUntil: 'domcontentloaded', timeout: 15000 })
          .catch(() => {}),
        submitBtn.click(),
      ]);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(3000);
      console.log('[Auth] After submit, URL:', page.url());
      continue;
    }

    console.log('[Auth] No login form or TOTP found, proceeding...');
    break;
  }

  await page.waitForLoadState('networkidle').catch(() => {});
  const authorizeBtn = page
    .getByRole('button', { name: /authorize/i })
    .or(page.locator('input[type="submit"][value*="Authorize"]'))
    .first();
  if (await authorizeBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    console.log('[Auth] GitLab authorize page detected, clicking Authorize...');
    await authorizeBtn.click();
    await page
      .waitForURL(url => url.hostname !== 'gitlab.com', { timeout: 30000 })
      .catch(() => {});
    console.log('[Auth] After authorize redirect, URL:', page.url());
  }
}

async function signInRHDHWithProvider(
  page: Page,
  login: (p: Page) => Promise<void>,
  providerName: string,
) {
  await login(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const signInGate = portalSignInMethodHeading(page);
  const gateVisible = await signInGate
    .isVisible({ timeout: 12000 })
    .catch(() => false);

  if (gateVisible) {
    const providerRow = page
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`Sign In using ${providerName}`, 'i') });
    await providerRow.getByRole('button', { name: /^Sign In$/i }).click();

    await page.waitForLoadState('domcontentloaded');

    for (let i = 0; i < 4; i++) {
      const authorize = page
        .getByRole('button', { name: /^Authorize$/i })
        .first();
      if (!(await authorize.isVisible({ timeout: 8000 }).catch(() => false))) {
        break;
      }
      await authorize.click();
      await page.waitForLoadState('domcontentloaded');
    }

    await expect(signInGate).toBeHidden({ timeout: 120000 });
  } else {
    const genericSignIn = page
      .getByRole('button', { name: /^Sign In$/i })
      .first();
    if (await genericSignIn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await genericSignIn.click();

      const authorizeVisible = await page
        .getByRole('button', { name: /^Authorize$/i })
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      if (authorizeVisible) {
        await page
          .getByRole('button', { name: /^Authorize$/i })
          .first()
          .click();
      }

      const ansible = page
        .getByRole('link', { name: /^Ansible$/i })
        .or(page.getByText('Ansible', { exact: true }))
        .first();
      if (await ansible.isVisible({ timeout: 8000 }).catch(() => false)) {
        await ansible.click();
        await page.waitForURL(/\/ansible/, { timeout: 30000 });
      }
    }
  }

  if (!page.url().includes('/ansible')) {
    await page.goto('/ansible', { waitUntil: 'domcontentloaded' });
  }

  if (await signInGate.isVisible({ timeout: 3000 }).catch(() => false)) {
    throw new Error(
      `Still on portal sign-in picker after ${providerName} flow; check OAuth app / credentials.`,
    );
  }
}

/**
 * Sign in to RHDH using GitLab authentication
 */
export async function signInRHDHWithGitLab(page: Page) {
  await signInRHDHWithProvider(page, loginGitLab, 'GitLab');
}

/**
 * Login to GitHub with 2FA
 * Migrated from Cypress Common.LogintoGithub()
 */
export async function loginGitHub(page: Page) {
  await page.goto('https://github.com/login');

  // Wait for the login form to be ready (avoid strict-mode text matches).
  await page.locator('#login_field').waitFor({ state: 'visible' });
  await page.locator('#password').waitFor({ state: 'visible' });

  // Fill credentials
  await page.locator('#login_field').fill(process.env.GH_USER_ID!);
  await page.locator('#password').fill(process.env.GH_USER_PASS!);

  // Click sign in
  await page.locator('input[type="submit"][value="Sign in"]').click();

  // Handle 2FA if required
  const totpFieldVisible = await page
    .locator('#app_totp')
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (totpFieldVisible) {
    const secret = process.env.AUTHENTICATOR_SECRET;
    if (!secret) {
      throw new Error(
        'AUTHENTICATOR_SECRET is required when GitHub prompts for TOTP (#app_totp)',
      );
    }
    const totp = authenticator.generate(secret);
    await page.locator('#app_totp').fill(totp);
    await page
      .getByRole('button', { name: /Verify|Continue/i })
      .first()
      .click()
      .catch(() => page.keyboard.press('Enter'));
    await page.waitForLoadState('domcontentloaded');
  }
}

/** Portal shell: user must pick Guest / GitHub / RH AAP (matches self-service login tests). */
function portalSignInMethodHeading(page: Page) {
  return page.getByRole('heading', { name: /select a sign-in method/i });
}

/**
 * Sign in to RHDH using GitHub authentication
 * Migrated from Cypress Common.SignIntoRHDHusingGithub()
 *
 * Handles multi-provider "Select a sign-in method" by clicking **GitHub**'s Sign In
 * (avoids strict-mode ambiguity with RH AAP's Sign In button).
 */
export async function signInRHDHWithGitHub(page: Page) {
  await signInRHDHWithProvider(page, loginGitHub, 'GitHub');
}
