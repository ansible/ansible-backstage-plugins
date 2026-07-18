#!/usr/bin/env node
/**
 * Local smoke test: Backstage health + gitRepositoriesExtensionsApiFactory export.
 * Optional Playwright browser check when AAP_USER_ID/AAP_USER_PASS are set.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distPath = resolve(
  repoRoot,
  'plugins/backstage-apme/dist/index.esm.js',
);

async function checkHttp(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return res.status;
  } catch {
    return 0;
  }
}

async function main() {
  const distExists = existsSync(distPath);
  let factoryInDist = false;
  if (distExists) {
    const dist = readFileSync(distPath, 'utf8');
    factoryInDist = dist.includes('gitRepositoriesExtensionsApiFactory');
  }

  const appApisPath = resolve(repoRoot, 'packages/app/src/apis.ts');
  const appApis = readFileSync(appApisPath, 'utf8');
  const factoryInAppApis = appApis.includes('gitRepositoriesExtensionsApiFactory');

  const frontendStatus = await checkHttp('http://localhost:3000/');
  const backendStatus = await checkHttp(
    'http://localhost:7007/api/catalog/health',
  );

  const serversUp = frontendStatus === 200;
  const hasCreds = Boolean(process.env.AAP_USER_ID && process.env.AAP_USER_PASS);

  if (hasCreds && serversUp) {
    try {
      const { chromium } = await import('@playwright/test');
      const browser = await chromium.launch({ channel: 'chrome', headless: true });
      const context = await browser.newContext({
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();

      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

      const needsSignIn = await page
        .getByText('Select a Sign-in method')
        .isVisible()
        .catch(() => false);
      if (needsSignIn) {
        const rhaapBtn = page
          .getByRole('listitem')
          .filter({ hasText: /RH AAP|Ansible Automation Platform/i })
          .getByRole('button', { name: /^Sign In$/ });
        if (await rhaapBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await rhaapBtn.click();
        } else {
          await page.getByRole('button', { name: /Sign In/i }).first().click();
        }
        await page.getByText('Log in to your account').waitFor({ timeout: 20000 });
        await page.locator('#pf-login-username-id').fill(process.env.AAP_USER_ID);
        await page.locator('#pf-login-password-id').fill(process.env.AAP_USER_PASS);
        await page.getByRole('button', { name: /Log in/i }).click();
        await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
      }

      await page.goto('/self-service/repositories/catalog', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(3000);

      await browser.close();
    } catch (err) {
      console.error('browser test failed', err);
    }
  }

  const pass = factoryInDist && factoryInAppApis && serversUp;

  console.log(
    JSON.stringify(
      {
        pass,
        factoryInDist,
        factoryInAppApis,
        frontendStatus,
        backendStatus,
        browserTestSkipped: !hasCreds,
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
