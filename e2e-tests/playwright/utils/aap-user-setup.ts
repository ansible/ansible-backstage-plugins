/**
 * Creates a non-admin test user in AAP via the API and assigns
 * Org Member role + Execute permission on job templates.
 *
 * Requires AAP_URL and AAP_TOKEN (admin token) environment variables.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const AAP_API = process.env.AAP_URL?.replace(/\/+$/, '');
const AAP_TOKEN = process.env.AAP_TOKEN;

let certCleanupPath: string | undefined;

function trustAAPCertificate(): void {
  if (!AAP_API) return;
  const parsed = new URL(AAP_API);
  if (parsed.protocol !== 'https:') return;
  if (process.env.NODE_EXTRA_CA_CERTS) return;

  try {
    const hostname = parsed.hostname;
    if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) return;
    const port = parsed.port || '443';

    const connectOut = execFileSync(
      'openssl',
      ['s_client', '-connect', `${hostname}:${port}`, '-servername', hostname],
      { encoding: 'utf-8', timeout: 10000, input: '' },
    );
    const cert = execFileSync('openssl', ['x509'], {
      encoding: 'utf-8',
      timeout: 10000,
      input: connectOut,
    });
    if (!cert.includes('BEGIN CERTIFICATE')) return;

    const tmpDir = mkdtempSync(path.join(tmpdir(), 'aap-cert-'));
    const certPath = path.join(tmpDir, 'ca.pem');
    writeFileSync(certPath, cert, { mode: 0o600 });
    process.env.NODE_EXTRA_CA_CERTS = certPath;
    certCleanupPath = tmpDir;
  } catch (e) {
    throw new Error(
      `[AAP Setup] Failed to extract AAP TLS certificate. ` +
        `Set NODE_EXTRA_CA_CERTS to a valid CA bundle, or ensure the AAP endpoint is reachable. ` +
        `Cause: ${e instanceof Error ? e.message : e}`,
    );
  }
}

export function cleanupCertificate(): void {
  if (certCleanupPath) {
    rmSync(certCleanupPath, { recursive: true, force: true });
    certCleanupPath = undefined;
  }
}

trustAAPCertificate();

async function aapRequest(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const url = `${AAP_API}/${endpoint.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${AAP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return res;
}

async function aapGet(endpoint: string) {
  const res = await aapRequest('GET', endpoint);
  if (!res.ok) throw new Error(`GET ${endpoint}: ${res.status}`);
  return res.json();
}

async function aapPost(endpoint: string, body: Record<string, unknown>) {
  const res = await aapRequest('POST', endpoint, body);
  return { res, status: res.status };
}

interface TestUser {
  id: number;
  username: string;
}

export async function createNonAdminTestUser(): Promise<TestUser> {
  const username = process.env.AAP_NONADMIN_USER_ID;
  const password = process.env.AAP_NONADMIN_USER_PASS;

  if (!username || !password) {
    throw new Error(
      'AAP_NONADMIN_USER_ID and AAP_NONADMIN_USER_PASS must be set',
    );
  }

  if (!AAP_API || !AAP_TOKEN) {
    console.log(
      '[AAP Setup] AAP_URL or AAP_TOKEN not set, skipping user creation',
    );
    return { id: 0, username };
  }

  // Skip user creation if using seeded data
  const isSeeded =
    process.env.USE_SEEDED_DATA === 'true' || username.startsWith('user_');
  if (isSeeded) {
    console.log('[AAP Setup] Using seeded user, skipping creation');
    const existingUsers = await aapGet(
      `api/gateway/v1/users/?username=${encodeURIComponent(username)}`,
    );
    if (existingUsers.count > 0) {
      const user = existingUsers.results[0];
      console.log(`[AAP Setup] Seeded user found (id: ${user.id})`);
      return { id: user.id, username };
    }
    throw new Error(`Seeded user ${username} not found in AAP`);
  }

  // Non-seeded user creation not supported (Jenkins always uses seeded data)
  throw new Error(
    `Non-seeded user "${username}" not supported. Use seeded users from manifest (user_*).`,
  );
}

export async function deleteNonAdminTestUser(): Promise<void> {
  const username = process.env.AAP_NONADMIN_USER_ID;
  if (!AAP_API || !AAP_TOKEN || !username) return;

  const isSeeded =
    process.env.USE_SEEDED_DATA === 'true' || username.startsWith('user_');
  if (isSeeded) {
    console.log('[AAP Teardown] Skipping deletion of seeded user');
    return;
  }

  try {
    const users = await aapGet(
      `api/gateway/v1/users/?username=${encodeURIComponent(username)}`,
    );
    if (users.count === 0) return;

    const userId = users.results[0].id;
    const res = await aapRequest('DELETE', `api/gateway/v1/users/${userId}/`);
    console.log(`[AAP Teardown] Deleted test user: ${res.status}`);
  } catch {
    console.log('[AAP Teardown] Could not delete test user');
  }
}
