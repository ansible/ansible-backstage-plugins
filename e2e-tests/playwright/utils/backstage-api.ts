import { Page } from '@playwright/test';

/**
 * Captures the Backstage identity token from the auth refresh response.
 * Must be called with a page from an authenticated browser context.
 * The token is needed for direct catalog API calls since the backend
 * requires Bearer auth, not just session cookies.
 */
export async function getBackstageToken(page: Page): Promise<string> {
  // Approach 1: Use page.evaluate to call the auth refresh endpoint
  // from within the browser context (which has the session cookies).
  const authProvider = process.env.BACKSTAGE_AUTH_PROVIDER ?? 'rhaap';
  const authEnv = process.env.BACKSTAGE_AUTH_ENV ?? 'production';

  const token = await page.evaluate(
    async ({ provider, env }) => {
      try {
        const res = await fetch(
          `/api/auth/${provider}/refresh?scope=read%20write&env=${env}`,
          { credentials: 'include' },
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data?.backstageIdentity?.token ?? null;
      } catch {
        return null;
      }
    },
    { provider: authProvider, env: authEnv },
  );

  if (token) return token;

  // Approach 2: Intercept the browser's auth refresh during page load
  const responsePromise = page.waitForResponse(
    res =>
      res.url().includes(`/api/auth/${authProvider}/refresh`) &&
      res.status() === 200,
    { timeout: 15000 },
  );

  // Navigate to force a fresh page load that triggers auth refresh
  await page.goto('/catalog', { waitUntil: 'domcontentloaded' });

  try {
    const refreshRes = await responsePromise;
    const data = await refreshRes.json();
    const interceptedToken = data?.backstageIdentity?.token;
    if (interceptedToken) return interceptedToken;
  } catch {
    // timeout or parse error
  }

  throw new Error(
    'Could not obtain Backstage identity token. Is the session authenticated?',
  );
}

/**
 * Helper to make authenticated catalog API requests.
 * Uses page.evaluate to include the browser context's session cookies.
 */
export async function catalogFetch(
  page: Page,
  path: string,
  token: string,
): Promise<{ status: number; ok: boolean; body: any }> {
  return page.evaluate(
    async ({ path: p, token: t }) => {
      const res = await fetch(`/api/catalog${p}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: res.status, ok: res.ok, body };
    },
    { path, token },
  );
}

/**
 * Helper using page.request (kept for backward compat but may not include cookies).
 */
export async function catalogRequest(page: Page, path: string, token: string) {
  return page.request.get(`/api/catalog${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
