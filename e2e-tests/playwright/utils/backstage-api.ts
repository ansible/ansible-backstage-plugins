import { Page } from '@playwright/test';
import { loginAAP } from './auth';

/**
 * Captures the Backstage identity token from the auth refresh response.
 * Must be called with a page from an authenticated browser context.
 * The token is needed for direct catalog API calls since the backend
 * requires Bearer auth, not just session cookies.
 */
export async function getBackstageToken(page: Page): Promise<string> {
  // Ensure we're on an authenticated page first
  // (session might be stale if previous tests navigated away)
  const currentUrl = page.url();
  if (
    !currentUrl.includes('/self-service') &&
    !currentUrl.includes('/catalog')
  ) {
    await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000); // Wait for session to establish
  }

  // Approach 1: Use page.evaluate to call the auth refresh endpoint
  // from within the browser context (which has the session cookies).
  const authProvider = process.env.BACKSTAGE_AUTH_PROVIDER ?? 'rhaap';
  const authEnv = process.env.BACKSTAGE_AUTH_ENV ?? 'production';

  const token = await page.evaluate(
    async ({ provider, env }) => {
      try {
        const res = await fetch(
          `/api/auth/${provider}/refresh?scope=read%20write&env=${env}`,
          {
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
          },
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

  // Approach 2: Force a page navigation to trigger auth refresh
  // This catches the refresh response during the page load
  let interceptedToken: string | null = null;

  const responseListener = async (res: any) => {
    if (
      res.url().includes(`/api/auth/${authProvider}/refresh`) &&
      res.status() === 200
    ) {
      try {
        const data = await res.json();
        interceptedToken = data?.backstageIdentity?.token ?? null;
      } catch {
        // ignore parse errors
      }
    }
  };

  page.on('response', responseListener);

  try {
    // Navigate to force a fresh page load that triggers auth refresh
    await page.goto('/self-service/catalog', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(2000); // Wait for any background auth refresh

    if (interceptedToken) return interceptedToken;

    // Last resort: re-authenticate if session is completely stale
    console.log(
      '[getBackstageToken] No token after navigation, attempting re-auth...',
    );
    await loginAAP(page);
    await page.waitForTimeout(2000);

    // Try one more time after re-auth
    const finalToken = await page.evaluate(
      async ({ provider, env }) => {
        try {
          const res = await fetch(
            `/api/auth/${provider}/refresh?scope=read%20write&env=${env}`,
            {
              credentials: 'include',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
            },
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

    if (finalToken) return finalToken;
  } finally {
    page.off('response', responseListener);
  }

  throw new Error(
    'Could not obtain Backstage identity token even after re-authentication',
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

/**
 * Discovers org namespaces dynamically from the catalog API.
 * Queries for Group entities with spec.type=organization and returns
 * their namespace slugs. Works on any AAP instance without hardcoding.
 */
export async function discoverOrgNamespaces(
  page: Page,
  token: string,
): Promise<string[]> {
  const result = await catalogFetch(
    page,
    '/entities?filter=kind=Group,spec.type=organization&limit=100',
    token,
  );
  if (!result.ok) return [];
  const groups: any[] = Array.isArray(result.body)
    ? result.body
    : (result.body?.items ?? []);
  return [
    ...new Set(
      groups
        .map((g: any) => g.metadata?.namespace)
        .filter((ns: string | undefined): ns is string => !!ns),
    ),
  ];
}
