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
  } catch {
    console.log(
      '[AAP Setup] Could not fetch AAP certificate for TLS trust, relying on NODE_TLS_REJECT_UNAUTHORIZED from environment',
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

  console.log('[AAP Setup] Creating non-admin test user...');

  // Check if user already exists
  const existingUsers = await aapGet(
    `api/gateway/v1/users/?username=${encodeURIComponent(username)}`,
  );
  if (existingUsers.count > 0) {
    const user = existingUsers.results[0];
    console.log(`[AAP Setup] User already exists (id: ${user.id})`);
    await ensureOrgMembership(user.id);
    await ensureJobTemplatePermissions(user.id);
    return { id: user.id, username };
  }

  // Create the user
  const { res, status } = await aapPost('api/gateway/v1/users/', {
    username,
    password,
    first_name: 'E2E',
    last_name: 'TestUser',
    email: `${username}@test.local`,
    is_superuser: false,
  });

  if (status === 201 || status === 200) {
    const user = await res.json();
    console.log(`[AAP Setup] Created user (id: ${user.id})`);
    await ensureOrgMembership(user.id);
    await ensureJobTemplatePermissions(user.id);
    return { id: user.id, username };
  }

  if (status === 400) {
    const err = await res.json();
    if (JSON.stringify(err).includes('already exists')) {
      const users = await aapGet(
        `api/gateway/v1/users/?username=${encodeURIComponent(username)}`,
      );
      const user = users.results[0];
      console.log(`[AAP Setup] User already exists (id: ${user.id})`);
      await ensureOrgMembership(user.id);
      await ensureJobTemplatePermissions(user.id);
      return { id: user.id, username };
    }
    throw new Error(`Failed to create user: HTTP 400`);
  }

  throw new Error(`Failed to create user: HTTP ${status}`);
}

async function ensureOrgMembership(userId: number): Promise<void> {
  const configuredOrg = process.env.AAP_ORG_NAME;
  if (!configuredOrg) {
    console.log('[AAP Setup] AAP_ORG_NAME not set, skipping org membership');
    return;
  }

  const orgs = await aapGet(
    `api/gateway/v1/organizations/?name=${encodeURIComponent(configuredOrg)}`,
  );
  if (orgs.count === 0) {
    console.log('[AAP Setup] No organizations found, skipping org membership');
    return;
  }

  const orgId = orgs.results[0].id;
  const orgName = orgs.results[0].name;

  // Use the controller API for org membership (gateway POST returns 405)
  const { status } = await aapPost(
    `api/controller/v2/organizations/${orgId}/users/`,
    { id: userId },
  );

  if (status === 204 || status === 200 || status === 201) {
    console.log(`[AAP Setup] Added user to org '${orgName}' (id: ${orgId})`);
  } else if (status === 409 || status === 400) {
    console.log(`[AAP Setup] User already in org '${orgName}'`);
  } else {
    console.log(
      `[AAP Setup] Org membership response: ${status} (may already be a member)`,
    );
  }
}

async function ensureJobTemplatePermissions(userId: number): Promise<void> {
  // Get job templates to assign execute permission
  const templates = await aapGet(
    'api/controller/v2/job_templates/?page_size=5',
  );
  if (templates.count === 0) {
    console.log(
      '[AAP Setup] No job templates found, skipping permission assignment',
    );
    return;
  }

  // Assign execute role on first few templates
  for (const template of templates.results.slice(0, 3)) {
    // Try to get the execute role for this template
    try {
      const roles = await aapGet(
        `api/controller/v2/job_templates/${template.id}/object_roles/`,
      );
      const executeRole = roles.results?.find(
        (r: { name: string }) =>
          r.name.toLowerCase().includes('execute') ||
          r.name.toLowerCase().includes('use'),
      );

      if (executeRole) {
        const { status } = await aapPost(
          `api/controller/v2/roles/${executeRole.id}/users/`,
          { id: userId },
        );
        console.log(
          `[AAP Setup] Assigned '${executeRole.name}' on template '${template.name}': ${status}`,
        );
      }
    } catch {
      console.log(
        `[AAP Setup] Could not assign role on template '${template.name}'`,
      );
    }
  }
}

export async function deleteNonAdminTestUser(): Promise<void> {
  const username = process.env.AAP_NONADMIN_USER_ID;
  if (!AAP_API || !AAP_TOKEN || !username) return;

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
