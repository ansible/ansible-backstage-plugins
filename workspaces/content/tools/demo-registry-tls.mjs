/**
 * TLS policy demo, executed against the running Automation Portal (AAP-96688).
 *
 * Drives the same API the Portal UI uses and checks each registry the demo
 * configures — three doors onto one local registry:
 *
 *   local-quay            plain HTTP, explicit insecure opt-out → sync completes
 *   local-quay-tls        verified HTTPS against a CA bundle    → sync completes
 *   local-quay-untrusted  HTTPS with an untrusted certificate   → sync fails,
 *                        naming the certificate, and keeps the index intact
 *
 * Prints expected vs actual per case and exits non-zero when reality differs,
 * so it is also a repeatable smoke test: run it during the demo, run it again
 * tomorrow.
 *
 * Mutating routes (POST .../sync) require an authenticated caller, so a token
 * is needed: sign in to the portal in a browser and copy the token, then pass
 * it with --token (or PORTAL_TOKEN).
 *
 * Usage: node workspaces/content/tools/demo-registry-tls.mjs \
 *          [--portal-url http://localhost:7007] [--token <backstage-jwt>]
 */
const args = process.argv.slice(2);
const urlFlag = args.indexOf('--portal-url');
const portalUrl =
  urlFlag >= 0
    ? args[urlFlag + 1]
    : (process.env.PORTAL_URL ?? 'http://localhost:7007');
const tokenFlag = args.indexOf('--token');
const token = tokenFlag >= 0 ? args[tokenFlag + 1] : process.env.PORTAL_TOKEN;
const base = `${portalUrl}/api/automation-content`;

const results = [];

async function api(path, init) {
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${base}${path}`, { ...init, headers: auth });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function check(name, expectation, actual, detail) {
  const pass = expectation === actual;
  results.push({ name, pass, expectation, actual, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}: expected ${expectation}, got ${actual}`);
  if (!pass && detail) {
    console.log(`        ${detail}`);
  }
}

async function syncRegistry(name) {
  const { status, body } = await api(`/registries/${name}/sync`, {
    method: 'POST',
  });
  if (status === 401) {
    throw new Error(
      `sync of ${name} returned HTTP 401: mutating routes require ` +
        `authentication — pass --token <backstage-jwt> (see the header comment)`,
    );
  }
  if (status !== 202) {
    throw new Error(
      `sync of ${name} returned HTTP ${status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

console.log(`Portal: ${base}`);

// 1. Health — all three demo registries must be configured.
const health = await api('/health');
check(
  'portal health',
  'ok',
  health.body.status,
  JSON.stringify(health.body).slice(0, 200),
);
const registryNames = (health.body.registries ?? []).map(r => r.name);
for (const name of ['local-quay', 'local-quay-tls', 'local-quay-untrusted']) {
  check(
    `registry configured: ${name}`,
    true,
    registryNames.includes(name),
    `configured registries: ${registryNames.join(', ')}`,
  );
}

// 2. Verified HTTPS — the ordinary, trusted case.
console.log('\nCase 1 — verified HTTPS (trusted CA bundle, verification on):');
const tls = await syncRegistry('local-quay-tls');
check('sync status', 'completed', tls.status, tls.error);
const tlsEes = await api('/execution-environments?registry=local-quay-tls');
check(
  'EE discovered over verified TLS',
  true,
  (tlsEes.body.items ?? []).some(e => e.repository === 'demo/network-ee'),
  JSON.stringify(tlsEes.body).slice(0, 200),
);

// 3. Plain HTTP through the explicit opt-out.
console.log('\nCase 2 — plain HTTP with the explicit insecure opt-out:');
const plain = await syncRegistry('local-quay');
check('sync status', 'completed', plain.status, plain.error);
const plainEes = await api('/execution-environments?registry=local-quay');
check(
  'EE discovered over plain HTTP (opt-out)',
  true,
  (plainEes.body.items ?? []).some(e => e.repository === 'demo/network-ee'),
  JSON.stringify(plainEes.body).slice(0, 200),
);

// 4. Untrusted certificate — the refusal that is the point of the story.
console.log('\nCase 3 — HTTPS with an untrusted certificate (no opt-out):');
const untrusted = await syncRegistry('local-quay-untrusted');
check('sync status', 'failed', untrusted.status, untrusted.error);
check(
  'error names the certificate',
  true,
  /self-signed|certificate|verify/i.test(untrusted.error ?? ''),
  `error was: ${untrusted.error}`,
);
check(
  'previous index retained',
  true,
  untrusted.retainedPrevious === true,
  JSON.stringify(untrusted).slice(0, 200),
);

// 5. Summary.
const failed = results.filter(r => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed.`,
);
if (failed.length > 0) {
  console.log('FAILED checks:');
  for (const r of failed) console.log(`  - ${r.name}`);
  process.exit(1);
}
console.log('Every registry behaved exactly as the transport policy requires.');
