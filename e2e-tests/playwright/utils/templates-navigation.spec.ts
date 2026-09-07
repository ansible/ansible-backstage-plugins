import type { Page } from '@playwright/test';
import { loginAAP } from './auth';

function signInPicker(page: Page) {
  return page
    .getByRole('heading', { name: /select a sign-in method/i })
    .or(page.getByText(/Select a sign-in method/i));
}

async function reloadTemplatesIndex(page: Page): Promise<void> {
  await page.goto('/self-service', {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
}

export async function navigateToTemplatesPage(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await reloadTemplatesIndex(page);
    if (
      await signInPicker(page)
        .isVisible()
        .catch(() => false)
    ) {
      await loginAAP(page);
      continue;
    }
    return;
  }
  throw new Error(
    'Still on sign-in picker after login retries; check AAP/session and BASE_URL.',
  );
}

export async function waitForTemplateDataOrEmptyState(
  page: Page,
): Promise<void> {
  if (
    await signInPicker(page)
      .isVisible()
      .catch(() => false)
  ) {
    await loginAAP(page);
    await reloadTemplatesIndex(page);
  }

  await page.waitForFunction(
    () => {
      const body = document.body?.innerText ?? '';
      if (body.includes('No templates') || body.includes('No Templates')) {
        return true;
      }
      if (document.querySelectorAll('main .MuiCard-root').length > 0) {
        return true;
      }
      if (
        document.querySelector('[data-testid="loading-templates"]') !== null
      ) {
        return true;
      }
      const search = document.querySelector('main input[placeholder="Search"]');
      if (search instanceof HTMLInputElement && !search.disabled) {
        return true;
      }
      if (body.includes('Error:')) {
        return true;
      }
      const main = document.querySelector('main');
      if (main && main.innerText.trim().length > 20) {
        return true;
      }
      return false;
    },
    undefined,
    { timeout: 90000 },
  );
}
