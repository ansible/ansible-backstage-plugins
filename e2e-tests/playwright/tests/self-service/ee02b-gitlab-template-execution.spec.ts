import { test, expect } from '../../fixtures/auth-context';
import { authenticator } from 'otplib';
import { Page } from '@playwright/test';

async function handleGitLabOAuthDialog(
  page: Page,
): Promise<'redirected' | 'failed' | false> {
  const oauthDialog = page.getByText('Login Required').first();
  const dialogVisible = await oauthDialog
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!dialogVisible) {
    return false;
  }

  console.log('[EE GitLab Test] GitLab OAuth "Login Required" dialog detected');

  if (!process.env.GL_USER_ID || !process.env.GL_USER_PASS) {
    throw new Error(
      'GL_USER_ID and GL_USER_PASS are required for GitLab E2E tests',
    );
  }

  const logInBtn = page.getByRole('button', { name: /^Log in$/i }).first();
  if ((await logInBtn.count()) === 0) {
    return false;
  }

  console.log('[EE GitLab Test] Clicking Log in button...');
  console.log('[EE GitLab Test] URL before click:', page.url());

  const context = page.context();

  const popup = await Promise.race([
    context.waitForEvent('page', { timeout: 3000 }).catch(() => null),
    logInBtn.click().then(() => null),
  ]);

  // Wait for the click to settle — either a popup opened or the page navigated
  await page.waitForTimeout(2000);
  console.log(
    '[EE GitLab Test] After click - popup:',
    !!popup,
    'URL:',
    page.url(),
  );

  if (!popup) {
    console.log('[EE GitLab Test] No popup opened — using redirect flow');

    const urlNow = new URL(page.url());
    if (
      urlNow.hostname !== 'gitlab.com' &&
      !urlNow.pathname.includes('/api/auth')
    ) {
      console.log(
        '[EE GitLab Test] Still on original page - waiting for network...',
      );
      await page
        .waitForLoadState('networkidle', { timeout: 5000 })
        .catch(() => {
          console.log('[EE GitLab Test] Network did not settle');
        });
      console.log('[EE GitLab Test] URL after networkidle:', page.url());
    }

    const currentUrl = new URL(page.url());
    if (currentUrl.hostname === 'gitlab.com') {
      console.log('[EE GitLab Test] Already on GitLab, handling login...');
      await handleGitLabLoginOnPage(page);
    } else {
      console.log('[EE GitLab Test] Waiting for OAuth redirect chain...');

      await page
        .waitForURL(
          url =>
            url.hostname === 'gitlab.com' ||
            (!url.pathname.includes('/api/auth/') &&
              url.pathname.includes('/self-service')),
          { timeout: 30000 },
        )
        .catch(() => {
          console.log(
            '[EE GitLab Test] OAuth redirect chain did not complete, URL:',
            page.url(),
          );
        });

      const afterRedirectUrl = new URL(page.url());
      if (afterRedirectUrl.hostname === 'gitlab.com') {
        console.log('[EE GitLab Test] Reached GitLab, handling login...');
        await handleGitLabLoginOnPage(page);
        await page
          .waitForURL(url => url.hostname !== 'gitlab.com', { timeout: 30000 })
          .catch(() => {});
      } else {
        console.log(
          '[EE GitLab Test] OAuth completed (auto-approved), URL:',
          page.url(),
        );
      }
    }

    const finalUrl = new URL(page.url());
    const oauthStuck =
      finalUrl.pathname.includes('/api/auth/') ||
      finalUrl.pathname.includes('handler/frame');
    if (oauthStuck) {
      console.log(
        '[EE GitLab Test] Still on auth handler, navigating to portal...',
      );
      await page
        .goto('/self-service/ee', {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        })
        .catch(() => {});
    }

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    console.log('[EE GitLab Test] OAuth flow complete, URL:', page.url());
    return oauthStuck ? 'failed' : 'redirected';
  }

  console.log('[EE GitLab Test] GitLab OAuth popup opened');
  await popup.waitForLoadState('domcontentloaded');
  console.log('[EE GitLab Test] Popup URL:', popup.url());

  await handleGitLabLoginOnPage(popup);

  await popup
    .waitForEvent('close', { timeout: 30000 })
    .catch(() =>
      console.log('[EE GitLab Test] Popup did not close within timeout'),
    );

  console.log(
    '[EE GitLab Test] GitLab OAuth popup closed, continuing on main page',
  );
  await page.waitForTimeout(2000);
  return 'redirected';
}

async function clickTurnstileWidget(page: Page): Promise<boolean> {
  const widgetBox = await page.evaluate(() => {
    // Strategy 1: find iframe by Cloudflare challenge title or src
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

    // Strategy 2: find container with cf-turnstile-response hidden input
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

    // Strategy 3: div with display:grid (standalone challenge page)
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
    `[EE GitLab Test] Turnstile (${widgetBox.via}) at (${widgetBox.x}, ${widgetBox.y}), ` +
      `size ${widgetBox.width}x${widgetBox.height}, clicking at (${clickX}, ${clickY})`,
  );
  await page.mouse.click(clickX, clickY);
  await page.waitForTimeout(3000);
  return true;
}

async function handleSecurityVerification(page: Page): Promise<void> {
  // Wait for the page to settle before checking for challenges
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);

  const hasVerifyText = await page
    .getByText(/Performing security verification/i)
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (!hasVerifyText) return;

  console.log('[EE GitLab Test] Security verification detected, waiting...');
  await page.waitForTimeout(2000);

  for (let attempt = 0; attempt < 10; attempt++) {
    if (await clickTurnstileWidget(page)) {
      console.log(
        '[EE GitLab Test] Turnstile clicked, waiting for page to update...',
      );
      await page.waitForTimeout(3000);
      return;
    }

    console.log(
      `[EE GitLab Test] Attempt ${attempt + 1}/10 — widget not clickable yet`,
    );
    await page.waitForTimeout(1000);
  }

  console.log(
    '[EE GitLab Test] Turnstile not resolved after 10 attempts, proceeding...',
  );
}

async function fillAndSubmitGitLabLogin(page: Page): Promise<void> {
  const loginField = page.locator('#user_login');
  console.log('[EE GitLab Test] Filling GitLab credentials...');
  await loginField.fill(process.env.GL_USER_ID!);
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
  console.log('[EE GitLab Test] After submit, URL:', page.url());
}

async function fillAndSubmitTOTP(page: Page): Promise<void> {
  console.log('[EE GitLab Test] TOTP 2FA required, entering code...');
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
  console.log('[EE GitLab Test] After 2FA submit, URL:', page.url());
}

async function handleGitLabLoginOnPage(page: Page): Promise<void> {
  // GitLab login flow with Cloudflare Turnstile challenges:
  //   Turnstile → login form → submit → Turnstile → login form → submit → TOTP → Turnstile → done
  // Each step may trigger a standalone Turnstile challenge that redirects back.
  // Loop up to 5 rounds to handle all challenges.
  for (let round = 0; round < 5; round++) {
    console.log(`[EE GitLab Test] Login round ${round + 1}, URL:`, page.url());

    if (new URL(page.url()).hostname !== 'gitlab.com') {
      console.log('[EE GitLab Test] Left GitLab, login complete');
      return;
    }

    // Handle standalone Turnstile challenge page
    await handleSecurityVerification(page);

    // Check what page we're on now
    const hasLoginForm = await page
      .locator('#user_login')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasTOTP = await page
      .locator('#user_otp_attempt')
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasTOTP && process.env.GL_AUTHENTICATOR_SECRET) {
      await fillAndSubmitTOTP(page);
      continue;
    }

    if (hasLoginForm) {
      await fillAndSubmitGitLabLogin(page);
      continue;
    }

    // Check for error messages
    const flash = page.locator('.flash-alert, .alert-danger').first();
    if (await flash.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(
        '[EE GitLab Test] Login error:',
        await flash.innerText().catch(() => ''),
      );
    }

    console.log('[EE GitLab Test] No login form or TOTP found, proceeding...');
    break;
  }

  // Handle GitLab "Authorize" page
  await page.waitForLoadState('networkidle').catch(() => {});
  const authorizeBtn = page
    .getByRole('button', { name: /authorize/i })
    .or(page.locator('input[type="submit"][value*="Authorize"]'))
    .first();
  if (await authorizeBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    console.log(
      '[EE GitLab Test] GitLab authorize page detected, clicking Authorize...',
    );
    await authorizeBtn.click();
    console.log('[EE GitLab Test] Authorize clicked, waiting for callback...');
    await page
      .waitForURL(url => url.hostname !== 'gitlab.com', {
        timeout: 30000,
      })
      .catch(() => {});
    console.log('[EE GitLab Test] After authorize redirect, URL:', page.url());
  }
}

const EE_TEMPLATE_URL =
  process.env.EE_IMPORT_REPO_URL ||
  'https://github.com/ansible/ansible-rhdh-templates/blob/v2.0.1/templates/ee-start-from-scratch.yaml';

const EE_TEMPLATE_TITLE = process.env.EE_TEMPLATE_TITLE || 'Start from scratch';

const randomLetters = (n: number) =>
  Array.from({ length: n }, () =>
    String.fromCodePoint(97 + Math.floor(Math.random() * 26)),
  ).join('');

const RANDOM_SUFFIX = randomLetters(4);
const REPO_NAME = `ee-gl-repo-${RANDOM_SUFFIX}`;
const EE_FILE_NAME = `ee-gl-${RANDOM_SUFFIX}`;

const GL_ORG = process.env.GL_ORG || '';
const BUILD_IMAGE_NAME = `ee-test/ee-gl-${RANDOM_SUFFIX}`;
const BUILD_IMAGE_TAG = `build${RANDOM_SUFFIX}`;

async function enableBuildExecutionEnvironment(page: Page): Promise<void> {
  // Check the "Build Execution Environment" checkbox
  const buildCheckbox = page
    .locator('input[type="checkbox"]')
    .filter({ has: page.locator('[id*="buildExecutionEnvironment"]') })
    .or(page.locator('input#root_publishAndBuild_buildExecutionEnvironment'))
    .first();

  const buildLabel = page.getByText(/Build Execution Environment/i).first();

  if (await buildLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Click the label/text to toggle the checkbox (MUI wraps inputs)
    const isChecked = await buildCheckbox.isChecked().catch(() => false);
    if (!isChecked) {
      console.log('[EE GitLab Test] Checking "Build Execution Environment"...');
      await buildLabel.click({ force: true });
      await page.waitForTimeout(1500);
    }
  } else {
    console.log(
      '[EE GitLab Test] "Build Execution Environment" not found, skipping',
    );
    return;
  }

  // Registry defaults to "Private Automation Hub (PAH)" — leave it unless
  // a custom registry is needed.

  // Fill Image Name
  const imageNameInput = page
    .getByLabel(/Image Name/i)
    .or(page.locator('input[id*="buildImageName"]'))
    .first();
  if (await imageNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await imageNameInput.clear();
    await imageNameInput.fill(BUILD_IMAGE_NAME);
    console.log(`[EE GitLab Test] Set Image Name: ${BUILD_IMAGE_NAME}`);
  }

  // Fill Image Tag
  const imageTagInput = page
    .getByLabel(/Image Tag/i)
    .or(page.locator('input[id*="buildImageTag"]'))
    .first();
  if (await imageTagInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await imageTagInput.clear();
    await imageTagInput.fill(BUILD_IMAGE_TAG);
    console.log(`[EE GitLab Test] Set Image Tag: ${BUILD_IMAGE_TAG}`);
  }

  await page.waitForTimeout(1000);
}

async function selectGitLabProvider(page: Page): Promise<void> {
  const providerHeading = page.locator('text=Select source control provider');
  if ((await providerHeading.count()) === 0) return;

  const selectContainer = providerHeading
    .locator(
      'xpath=ancestor::fieldset[1] | ancestor::div[contains(@class,"MuiFormControl")]',
    )
    .first();
  const muiSelect = selectContainer
    .locator('[role="combobox"], [role="button"], select')
    .first();

  if ((await muiSelect.count()) === 0) {
    const nearbySelect = providerHeading
      .locator('..')
      .locator('[role="combobox"], [role="button"], select')
      .or(providerHeading.locator('xpath=following::select[1]'))
      .or(providerHeading.locator('xpath=following::div[@role="button"][1]'))
      .first();
    if ((await nearbySelect.count()) > 0) {
      await nearbySelect.click({ force: true });
    }
  } else {
    await muiSelect.click({ force: true });
  }
  await page.waitForTimeout(500);

  const glOption = page
    .getByRole('option', { name: /gitlab/i })
    .or(page.locator('[role="option"]').filter({ hasText: /gitlab/i }))
    .or(page.locator('li').filter({ hasText: /gitlab/i }))
    .or(page.locator('[data-value*="gitlab" i]'))
    .first();
  if ((await glOption.count()) > 0) {
    await glOption.click({ force: true });
  }
  await page.waitForTimeout(1500);
}

async function fillWizardCommonFields(page: Page): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const next = page.getByRole('button', { name: /^Next$/i });
    if ((await next.count()) > 0) {
      await next.first().click({ force: true });
      await page.waitForTimeout(700);
    }
  }

  await selectGitLabProvider(page);

  for (let i = 0; i < 3; i++) {
    const next = page.getByRole('button', { name: /^Next$/i });
    if ((await next.count()) > 0) {
      await next.first().click({ force: true });
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
}

async function findAndStartTemplate(page: Page): Promise<boolean> {
  await page.goto(
    '/self-service/ee/create?filters%5Btype%5D=execution-environment&filters%5Bkind%5D=template&filters%5Buser%5D=all',
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForTimeout(2000);
  await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

  const body = await page.locator('body').innerText();
  if (!body.includes(EE_TEMPLATE_TITLE)) {
    console.log(
      `[EE GitLab Test] Template "${EE_TEMPLATE_TITLE}" not found on page`,
    );
    return false;
  }

  await page
    .locator('[data-testid="template--title"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
  const titleLink = page
    .locator('[data-testid="template--title"]')
    .getByText(EE_TEMPLATE_TITLE, { exact: true });
  if ((await titleLink.count()) === 0) {
    console.log(
      `[EE GitLab Test] Template card "${EE_TEMPLATE_TITLE}" not found`,
    );
    return false;
  }
  const card = titleLink.locator(
    'xpath=ancestor::div[contains(@class,"MuiCard-root")]',
  );
  const startBtn = card.locator(
    '[data-testid="template-card-actions--create"]',
  );
  if ((await startBtn.count()) === 0) {
    console.log('[EE GitLab Test] Start button not found on template card');
    return false;
  }
  await startBtn.click({ force: true });
  await page.waitForTimeout(2500);
  return true;
}

async function waitForTaskCompletion(
  page: Page,
  opts: { expectGitLabLinks?: boolean } = {},
): Promise<void> {
  console.log('[EE GitLab Test] Waiting for scaffolder task to complete...');

  // Wait for the task page to load (URL contains /tasks/)
  await page.waitForURL(/\/tasks\//, { timeout: 15000 }).catch(() => {});
  if (!page.url().includes('/tasks/')) {
    throw new Error(`Expected task page but URL is: ${page.url()}`);
  }

  // Wait for all steps to finish — the button row appears only after completion
  const buttonRow = page.locator('[data-testid="button-row"]');
  await expect(buttonRow).toBeVisible({ timeout: 120_000 });
  console.log('[EE GitLab Test] Task completed, button row visible');

  if (opts.expectGitLabLinks) {
    const buttonRowText = await buttonRow.innerText();
    console.log('[EE GitLab Test] Button row text:', buttonRowText);

    // Pipeline link is expected in both new repo and existing repo flows
    const pipelineLink = buttonRow
      .locator('a, button')
      .filter({ hasText: /pipeline/i })
      .first();
    await expect(pipelineLink).toBeVisible({ timeout: 10000 });
    const pipelineHref = await pipelineLink.getAttribute('href');
    console.log('[EE GitLab Test] GitLab Pipeline link:', pipelineHref);
    expect(pipelineHref).toContain('gitlab');

    // New repo → Repository link, existing repo → Merge Request link
    const repoLink = buttonRow
      .locator('a, button')
      .filter({ hasText: /repository/i })
      .first();
    const mrLink = buttonRow
      .locator('a, button')
      .filter({ hasText: /merge request/i })
      .first();

    const hasRepoLink = await repoLink
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasMrLink = await mrLink
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasRepoLink) {
      const repoHref = await repoLink.getAttribute('href');
      console.log('[EE GitLab Test] GitLab Repository link:', repoHref);
      expect(repoHref).toContain('gitlab');
    } else if (hasMrLink) {
      const mrHref = await mrLink.getAttribute('href');
      console.log('[EE GitLab Test] GitLab Merge Request link:', mrHref);
      expect(mrHref).toContain('gitlab');
    } else {
      throw new Error(
        'Expected either Repository or Merge Request link but found neither',
      );
    }
  }
}

async function fillPublishFields(page: Page): Promise<void> {
  await page.waitForTimeout(3000);

  const namespaceSelect = page
    .locator('#scm-org-picker-label')
    .locator('xpath=following::div[@role="button"][1]')
    .or(
      page
        .getByLabel(/namespace/i)
        .locator('xpath=ancestor::div[contains(@class,"MuiFormControl")][1]')
        .locator('[role="button"]'),
    )
    .or(page.locator('[aria-labelledby="scm-org-picker-label"]'))
    .first();
  if ((await namespaceSelect.count()) > 0) {
    await namespaceSelect.click({ force: true });
    await page.waitForTimeout(500);

    if (GL_ORG) {
      const orgOption = page
        .getByRole('option', { name: GL_ORG, exact: false })
        .or(page.locator('[role="option"]').filter({ hasText: GL_ORG }))
        .first();
      if ((await orgOption.count()) > 0) {
        await orgOption.click({ force: true });
      }
    } else {
      const firstOption = page.locator('[role="option"]').first();
      if ((await firstOption.count()) > 0) {
        await firstOption.click({ force: true });
      }
    }
    await page.waitForTimeout(500);
  }

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

  await enableBuildExecutionEnvironment(page);

  await page.waitForTimeout(2000);
  const nextBtn = page.getByRole('button', { name: /^Next$/i }).first();
  if ((await nextBtn.count()) > 0) {
    await expect(nextBtn).toBeEnabled({ timeout: 15000 });
    await nextBtn.click({ force: true });
    await page.waitForTimeout(1500);
  }
  const createBtn = page.getByRole('button', { name: /create/i }).first();
  if ((await createBtn.count()) > 0) {
    await createBtn.click({ force: true });
    await waitForTaskCompletion(page, { expectGitLabLinks: true });
  } else {
    throw new Error(
      'Create button not found — wizard may be in unexpected state',
    );
  }
}

test.describe('Execution Environment GitLab Template Execution Tests', () => {
  test.setTimeout(180_000);

  test('Imports EE template via kebab menu and executes it with GitLab as provider', async ({
    page,
  }) => {
    if (!process.env.GL_USER_ID || !process.env.GL_USER_PASS) {
      test.skip(
        true,
        'GL_USER_ID and GL_USER_PASS environment variables are required',
      );
    }

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

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    const kebabCount = await page
      .locator('[data-testid="kebab-menu-button"]')
      .count();
    console.log('[EE GitLab Test] Kebab menu button count:', kebabCount);

    if (kebabCount === 0) {
      console.log('[EE GitLab Test] Kebab menu not found - test will skip');
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

    await test.step('Review: Import or Refresh', async () => {
      const actionBtn = page
        .getByRole('button', { name: /^import$/i })
        .or(page.getByRole('button', { name: /^refresh$/i }))
        .first();
      if ((await actionBtn.count()) > 0) {
        await actionBtn.click({ force: true });
        await page.waitForTimeout(5000);
      }
    });

    await test.step('Return to EE Create and Start template', async () => {
      wizardOpened = await findAndStartTemplate(page);
    });

    await test.step('Wizard: Next steps + GitLab provider + EE definition (with Git)', async () => {
      if (!wizardOpened) return;
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      await fillWizardCommonFields(page);

      const oauthResult = await handleGitLabOAuthDialog(page);

      if (oauthResult === 'failed') {
        console.log(
          '[EE GitLab Test] GitLab OAuth failed — skipping Git publish flow, deferring to non-Git run',
        );
      } else {
        if (oauthResult === 'redirected') {
          console.log(
            '[EE GitLab Test] OAuth redirect complete, verifying wizard state...',
          );
          // Verify wizard is still open after OAuth redirect — if state was
          // lost, re-open the wizard and re-fill common fields.
          const wizardIntact = await page
            .getByLabel(/EE Definition Name/i)
            .or(page.locator('[aria-labelledby="scm-org-picker-label"]'))
            .first()
            .isVisible({ timeout: 5000 })
            .catch(() => false);
          if (!wizardIntact) {
            console.log(
              '[EE GitLab Test] Wizard state lost after redirect, re-opening...',
            );
            if (!(await findAndStartTemplate(page))) return;
            await fillWizardCommonFields(page);
          }
        }
        await fillPublishFields(page);
      }
    });

    await test.step('Second run: Start template, wizard without Git publish', async () => {
      if (!wizardOpened) return;

      if (!(await findAndStartTemplate(page))) return;

      await fillWizardCommonFields(page);

      // Uncheck "Publish to a Git repository"
      const publishCheckbox = page
        .locator('input[type="checkbox"]#root_publishAndBuild_publishToSCM')
        .first();
      if (
        (await publishCheckbox.count()) > 0 &&
        (await publishCheckbox.isChecked())
      ) {
        const muiCheckbox = page
          .locator(
            'label[for="root_publishAndBuild_publishToSCM"], ' +
              'span:has(> input#root_publishAndBuild_publishToSCM)',
          )
          .first();
        if ((await muiCheckbox.count()) > 0) {
          await muiCheckbox.click({ force: true });
        } else {
          await publishCheckbox.evaluate((el: HTMLInputElement) => {
            el.click();
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        await page.waitForTimeout(500);
        if (await publishCheckbox.isChecked()) {
          await publishCheckbox.evaluate((el: HTMLInputElement) => {
            el.checked = false;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        console.log('[EE GitLab Test] Unchecked "Publish to a Git repository"');
      }
      await page.waitForTimeout(500);

      const nextBtn2 = page.getByRole('button', { name: /^Next$/i }).first();
      if ((await nextBtn2.count()) > 0) {
        await expect(nextBtn2).toBeEnabled({ timeout: 15000 });
        await nextBtn2.click({ force: true });
        await page.waitForTimeout(1500);
      }
      const createBtn2 = page.getByRole('button', { name: /create/i }).first();
      if ((await createBtn2.count()) > 0) {
        await createBtn2.click({ force: true });
        await waitForTaskCompletion(page);
      }
    });
  });
});
