#!/usr/bin/env node
/**
 * A deliberately hostile local OCI registry for manually testing the
 * credential-redaction boundary of the automation-content plugins.
 *
 * Ordinary registries cooperate: they keep credentials out of responses and
 * name repositories after products. This fixture does the opposite, on
 * purpose. Redaction can only be tested against a registry that actually
 * tries to leak, so every value the registry controls quotes a credential:
 *
 *   - repository names are the configured password (`<password>/ee`)
 *   - collection descriptions, module documentation and option help quote
 *     the credential the connection used
 *   - a repository whose tag listing always fails produces error text that
 *     carries the credential-bearing repository name
 *   - the token-exchange registry echoes the very bearer token the client
 *     presents, inside the content manifest it serves
 *
 * One process serves four independent registries on loopback ports, so one
 * portal configuration can exercise every authentication mode:
 *
 *   lab-basic   :8446  HTTP Basic authentication
 *   lab-token   :8447  401 challenge → token exchange → bearer token
 *   lab-bearer  :8448  a pre-issued static bearer token
 *   lab-urlpw   :8449  anonymous; the credential travels in the portal's
 *                      configured URL (see the testing guide — the HTTP
 *                      stack itself refuses such URLs, and the failure
 *                      diagnostics are what gets checked)
 *
 * A small control plane (no authentication, loopback only) drives the
 * failure, drift and rotation scenarios without restarting anything:
 *
 *   GET  /__lab/status   counters, issued tokens, current state
 *   POST /__lab/control  {"registry": "lab-basic",
 *                         "action": "fail" | "recover" | "add-tag"
 *                                   | "set-password",
 *                         "password": "..."}   (set-password only)
 *
 * Plain Node, no dependencies: `node server.mjs`. Everything is in memory;
 * restart resets the registry to its initial hostile state.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

// ---------------------------------------------------------------------------
// OCI media types (mirrors automation-content-common/src/oci/types.ts)
// ---------------------------------------------------------------------------

const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const OCI_CONFIG = 'application/vnd.oci.image.config.v1+json';
const CONTENT_MANIFEST_ARTIFACT =
  'application/vnd.ansible.content-manifest.v1+json';

const HOST = '127.0.0.1';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const config = {
  basicPort: Number(process.env.LAB_BASIC_PORT ?? 8446),
  tokenPort: Number(process.env.LAB_TOKEN_PORT ?? 8447),
  bearerPort: Number(process.env.LAB_BEARER_PORT ?? 8448),
  urlpwPort: Number(process.env.LAB_URLPW_PORT ?? 8449),
  username: process.env.LAB_USERNAME ?? 'ci',
  password: required('LAB_PASSWORD'),
  staticToken: required('LAB_STATIC_TOKEN'),
  // The URL-embedded password, in its percent-encoded spelling. The decoded
  // spelling is derived here so the two can never drift apart.
  urlPasswordEncoded: required('LAB_URL_PASSWORD'),
};
config.urlPasswordDecoded = safeDecode(config.urlPasswordEncoded);

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Digest helpers
// ---------------------------------------------------------------------------

const sha = value =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

const size = value => Buffer.byteLength(value);

// ---------------------------------------------------------------------------
// Hostile fixture data
// ---------------------------------------------------------------------------

/**
 * A build-time content manifest whose every human-readable field quotes a
 * credential. This is the document the plugins enumerate and republish, so
 * descriptions, module documentation and option help all flow into API
 * responses and catalog entities.
 */
function contentManifest(credential, namespace = 'demo', name = 'net') {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-01-01T00:00:00Z',
    generatedBy: {
      tool: 'ansible-builder',
      version: '1.2.0',
      ansibleCore: '2.16.3',
      docsMode: 'full',
      docsSource: 'ansible-doc',
    },
    complete: true,
    collections: [
      {
        namespace,
        name,
        version: '1.0.0',
        description: `networking collection built with ${credential}`,
        plugins: [
          {
            name: 'vlans',
            type: 'module',
            fqcn: 'demo.net.vlans',
            shortDescription: `manage VLANs (built with ${credential})`,
            description: [
              `VLAN resource module, documented for ${credential}.`,
            ],
            options: {
              name: {
                type: 'str',
                description: [
                  `ASCII name of the VLAN, issued to ${credential}.`,
                ],
              },
            },
          },
        ],
        roles: [],
        playbooks: [],
        edaPlugins: [],
        rulebooks: [],
      },
    ],
  };
}

/**
 * Build one EE image, with a content-manifest referrer unless `clean` is set.
 *
 * `credentialFor` is attached after construction (see `withCredentialFor`)
 * and receives the request's Authorization header; it returns the credential
 * string to embed in the manifest payload. Static registries ignore the
 * header; the token-exchange registry echoes the bearer token the client
 * used, which is the point. The referrer's descriptor digest is computed
 * from a placeholder rendering so it stays stable across requests; the
 * served payload is rendered per request. The plugins trust the digest
 * header rather than hashing the body, so this keeps the fixture honest
 * about its hostility without breaking the protocol.
 */
function makeEE({
  tag,
  labels = {},
  clean = false,
  manifestFor = contentManifest,
}) {
  const allLabels = {
    'ansible-execution-environment': 'true',
    ...labels,
  };
  const config = {
    architecture: 'amd64',
    os: 'linux',
    config: { Labels: allLabels },
  };
  const configJson = JSON.stringify(config);
  const manifest = {
    schemaVersion: 2,
    mediaType: OCI_MANIFEST,
    config: {
      mediaType: OCI_CONFIG,
      digest: sha(configJson),
      size: size(configJson),
    },
    layers: [],
  };
  const manifestJson = JSON.stringify(manifest);
  const image = {
    tag,
    digest: sha(manifestJson),
    manifest,
    manifestJson,
    configJson,
    referrer: null,
  };

  if (!clean) {
    const placeholder = JSON.stringify(manifestFor(PLACEHOLDER));
    const payloadDigest = sha(placeholder);
    const referrerManifest = {
      schemaVersion: 2,
      mediaType: OCI_MANIFEST,
      artifactType: CONTENT_MANIFEST_ARTIFACT,
      config: { mediaType: OCI_CONFIG, digest: sha('{}'), size: 2 },
      layers: [
        {
          mediaType: CONTENT_MANIFEST_ARTIFACT,
          digest: payloadDigest,
          size: size(placeholder),
        },
      ],
      subject: {
        mediaType: OCI_MANIFEST,
        digest: image.digest,
        size: size(manifestJson),
      },
    };
    const referrerJson = JSON.stringify(referrerManifest);
    image.referrer = {
      digest: sha(referrerJson),
      manifestJson: referrerJson,
      payloadDigest,
    };
  }
  image.manifestFor = manifestFor;
  return image;
}

const PLACEHOLDER = 'lab-placeholder-credential';

function renderPayload(image, authorization) {
  const credential =
    typeof image.credentialFor === 'function'
      ? image.credentialFor(authorization)
      : PLACEHOLDER;
  return JSON.stringify(
    image.manifestFor?.(credential) ?? contentManifest(credential),
  );
}

// Wire the per-image credential source into the image object.
function withCredentialFor(image, credentialFor) {
  image.credentialFor = credentialFor;
  return image;
}

// ---------------------------------------------------------------------------
// Virtual registries
// ---------------------------------------------------------------------------

function labBasicRepos(registry) {
  const password = registry.password;
  return [
    {
      name: `${password}/ee`,
      broken: false,
      images: [
        withCredentialFor(makeEE({ tag: 'v1' }), () => registry.password),
      ],
    },
    {
      // Always fails: per-repository isolation and redacted failure text.
      name: `${password}/broken-ee`,
      broken: true,
      images: [],
    },
    {
      // The honest control: clean data, no manifest, unknown contents.
      name: 'demo/network-ee',
      broken: false,
      images: [makeEE({ tag: 'v1', clean: true })],
    },
  ];
}

function labTokenRepos(registry) {
  return [
    {
      // The Basic password is also registered for this connection. Keeping
      // it in the repository name makes drift diagnostics exercise the same
      // response redaction boundary as the content manifest.
      name: `${registry.password}/token-ee`,
      broken: false,
      images: [
        withCredentialFor(
          makeEE({
            tag: 'v1',
            manifestFor: credential =>
              contentManifest(credential, 'token', 'net'),
          }),
          authorization => bearerValue(authorization) ?? PLACEHOLDER,
        ),
      ],
    },
    {
      name: 'demo/network-ee',
      broken: false,
      images: [makeEE({ tag: 'v1', clean: true })],
    },
  ];
}

function labBearerRepos(registry) {
  return [
    {
      name: 'demo/bearer-ee',
      broken: false,
      images: [
        withCredentialFor(makeEE({ tag: 'v1' }), () => registry.staticToken),
      ],
    },
  ];
}

function labUrlpwRepos(registry) {
  return [
    {
      name: 'demo/urlpw-ee',
      broken: false,
      images: [
        withCredentialFor(
          makeEE({ tag: 'v1' }),
          () => registry.urlPasswordDecoded,
        ),
        withCredentialFor(
          makeEE({
            tag: 'v2',
            labels: { 'org.opencontainers.image.version': 'encoded' },
          }),
          () => registry.urlPasswordEncoded,
        ),
      ],
    },
  ];
}

const registries = [
  {
    name: 'lab-basic',
    port: config.basicPort,
    mode: 'basic',
    state: 'ok',
    password: config.password,
    username: config.username,
    get repos() {
      return this._repos;
    },
    set repos(value) {
      this._repos = value;
    },
    _repos: [],
    requests: 0,
    unauthorized: 0,
    rebuild() {
      this._repos = labBasicRepos(this);
    },
  },
  {
    name: 'lab-token',
    port: config.tokenPort,
    mode: 'bearer-challenge',
    state: 'ok',
    password: config.password,
    username: config.username,
    repos: labTokenRepos({ password: config.password }),
    requests: 0,
    unauthorized: 0,
    tokensIssued: 0,
    lastToken: undefined,
    runtimeToken: `lab-runtime-${randomBytes(12).toString('hex')}`,
    issued: new Set(),
  },
  {
    name: 'lab-bearer',
    port: config.bearerPort,
    mode: 'static-bearer',
    state: 'ok',
    staticToken: config.staticToken,
    repos: labBearerRepos({ staticToken: config.staticToken }),
    requests: 0,
    unauthorized: 0,
  },
  {
    name: 'lab-urlpw',
    port: config.urlpwPort,
    mode: 'anonymous',
    state: 'ok',
    urlPasswordEncoded: config.urlPasswordEncoded,
    urlPasswordDecoded: config.urlPasswordDecoded,
    repos: labUrlpwRepos({
      urlPasswordEncoded: config.urlPasswordEncoded,
      urlPasswordDecoded: config.urlPasswordDecoded,
    }),
    requests: 0,
    unauthorized: 0,
  },
];
registries[0].rebuild();

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

function bearerValue(authorization) {
  if (typeof authorization !== 'string') return undefined;
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
}

function basicMatches(authorization, username, password) {
  if (typeof authorization !== 'string' || !authorization.startsWith('Basic '))
    return false;
  const expected = Buffer.from(`${username}:${password}`, 'utf8').toString(
    'base64',
  );
  const presented = authorization.slice('Basic '.length);
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The hostile 401/500 body. The plugins only read statuses from these
 * responses, but the body quotes the credential anyway: the day a code path
 * starts reading error bodies is the day this fixture earns its keep.
 */
function hostileError(registry) {
  const credential =
    registry.password ?? registry.staticToken ?? registry.urlPasswordEncoded;
  return JSON.stringify({
    errors: [
      {
        code: 'UNAVAILABLE',
        message: `registry rejected credential ${credential}`,
      },
    ],
  });
}

function authorized(registry, req) {
  const authorization = req.headers.authorization;
  switch (registry.mode) {
    case 'basic':
      return basicMatches(authorization, registry.username, registry.password);
    case 'bearer-challenge':
      return registry.issued.has(bearerValue(authorization));
    case 'static-bearer':
      return bearerValue(authorization) === registry.staticToken;
    case 'anonymous':
      return true;
    default:
      return false;
  }
}

function challenge(registry) {
  switch (registry.mode) {
    case 'basic':
      return 'Basic realm="lab-basic"';
    case 'bearer-challenge':
      // The realm advertises this server's own token endpoint, as a real
      // registry would. `localhost` matches how the portal configures it.
      return `Bearer realm="http://localhost:${registry.port}/token",service="lab-token",scope="repository:*:pull"`;
    case 'static-bearer':
      // A Basic challenge the client cannot exchange — the static bearer
      // header on the retry is the intended path.
      return 'Basic realm="lab-bearer"';
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, body, headers = {}) {
  send(res, status, JSON.stringify(body), {
    'content-type': 'application/json',
    ...headers,
  });
}

function notFound(res) {
  sendJson(res, 404, { errors: [{ code: 'NAME_UNKNOWN' }] });
}

function findRepo(registry, name) {
  return registry.repos.find(repo => repo.name === name);
}

function serveTokenEndpoint(registry, req, res) {
  if (registry.mode !== 'bearer-challenge') return notFound(res);
  if (
    !basicMatches(
      req.headers.authorization,
      registry.username,
      registry.password,
    )
  ) {
    registry.unauthorized += 1;
    send(res, 401, 'unauthorized', {
      'www-authenticate': 'Basic realm="lab-token-exchange"',
    });
    return;
  }
  // Keep one token for the lifetime of the fixture. The API client and the
  // catalog provider are separate clients and may exchange independently;
  // using one value makes the manual check deterministic while the counter
  // still proves that the exchange occurred.
  const token = registry.runtimeToken;
  registry.issued.add(token);
  registry.tokensIssued += 1;
  registry.lastToken = token;
  sendJson(res, 200, { token, expires_in: 300 });
}

function isPerRepoPath(path) {
  return (
    /\/tags\/list$/.test(path) ||
    /\/manifests\//.test(path) ||
    /\/blobs\//.test(path) ||
    /\/referrers\//.test(path)
  );
}

function handleApi(registry, req, res, path) {
  // Version check: answer 200 when authorized, challenge when not. The
  // client primes this endpoint anonymously, so a challenge here is normal.
  if (path === '/v2/' || path === '/v2') {
    if (authorized(registry, req)) return sendJson(res, 200, {});
    registry.unauthorized += 1;
    const header = challenge(registry);
    return send(
      res,
      401,
      'unauthorized',
      header ? { 'www-authenticate': header } : {},
    );
  }

  if (!authorized(registry, req)) {
    registry.unauthorized += 1;
    const header = challenge(registry);
    return send(
      res,
      401,
      'unauthorized',
      header ? { 'www-authenticate': header } : {},
    );
  }

  // The `fail` state takes down per-repository endpoints but leaves /v2/,
  // the catalog listing and the token endpoint standing, so failures surface
  // as per-repository errors (the path where repository names — and their
  // embedded credentials — reach the error text).
  if (registry.state === 'fail' && isPerRepoPath(path)) {
    return send(res, 500, hostileError(registry), {
      'content-type': 'application/json',
    });
  }

  if (path === '/v2/_catalog') {
    return sendJson(res, 200, {
      repositories: registry.repos.map(repo => repo.name),
    });
  }

  let match = /^\/v2\/(.+)\/tags\/list$/.exec(path);
  if (match) {
    const repo = findRepo(registry, match[1]);
    if (!repo) return notFound(res);
    if (repo.broken) {
      return send(res, 500, hostileError(registry), {
        'content-type': 'application/json',
      });
    }
    return sendJson(res, 200, {
      name: repo.name,
      tags: repo.images.map(image => image.tag),
    });
  }

  match = /^\/v2\/(.+)\/referrers\/([^/?]+)$/.exec(path);
  if (match) {
    const repo = findRepo(registry, match[1]);
    const image = repo?.images.find(image => image.digest === match[2]);
    const manifests = image?.referrer
      ? [
          {
            mediaType: OCI_MANIFEST,
            digest: image.referrer.digest,
            size: size(image.referrer.manifestJson),
            artifactType: CONTENT_MANIFEST_ARTIFACT,
          },
        ]
      : [];
    return sendJson(res, 200, {
      schemaVersion: 2,
      mediaType: OCI_INDEX,
      manifests,
    });
  }

  match = /^\/v2\/(.+)\/manifests\/([^/?]+)$/.exec(path);
  if (match) {
    const repo = findRepo(registry, match[1]);
    if (!repo) return notFound(res);
    const reference = match[2];

    // A referrer descriptor is itself an addressable manifest.
    const owner = repo.images.find(
      image => image.referrer && image.referrer.digest === reference,
    );
    if (owner) {
      return sendJson(res, 200, JSON.parse(owner.referrer.manifestJson), {
        'content-type': OCI_MANIFEST,
        'docker-content-digest': owner.referrer.digest,
      });
    }

    const image = repo.images.find(
      candidate =>
        candidate.tag === reference || candidate.digest === reference,
    );
    if (!image) return notFound(res);

    const headers = {
      'content-type': image.manifest.mediaType ?? OCI_MANIFEST,
      'docker-content-digest': image.digest,
    };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      return res.end();
    }
    return send(res, 200, image.manifestJson, headers);
  }

  match = /^\/v2\/(.+)\/blobs\/([^/?]+)$/.exec(path);
  if (match) {
    const repo = findRepo(registry, match[1]);
    if (!repo) return notFound(res);
    const digest = match[2];

    for (const image of repo.images) {
      if (image.manifest.config.digest === digest) {
        return send(res, 200, image.configJson, {
          'content-type': OCI_CONFIG,
        });
      }
      // The content-manifest payload, rendered per request so the
      // token-exchange registry can echo the presented credential.
      if (image.referrer && image.referrer.payloadDigest === digest) {
        return send(res, 200, renderPayload(image, req.headers.authorization), {
          'content-type': CONTENT_MANIFEST_ARTIFACT,
        });
      }
    }
    return notFound(res);
  }

  return notFound(res);
}

// ---------------------------------------------------------------------------
// Control plane
// ---------------------------------------------------------------------------

function statusBody() {
  return {
    service: 'registry-credentials-lab',
    registries: Object.fromEntries(
      registries.map(registry => {
        const entry = {
          port: registry.port,
          mode: registry.mode,
          state: registry.state,
          repositories: registry.repos.map(repo => repo.name),
          requests: registry.requests,
          unauthorized: registry.unauthorized,
        };
        if (registry.mode === 'bearer-challenge') {
          entry.tokensIssued = registry.tokensIssued;
          entry.lastToken = registry.lastToken;
        }
        return [registry.name, entry];
      }),
    ),
  };
}

function redactFixtureLog(value) {
  const secrets = [
    config.password,
    config.staticToken,
    config.urlPasswordEncoded,
    config.urlPasswordDecoded,
    Buffer.from(`${config.username}:${config.password}`, 'utf8').toString(
      'base64',
    ),
    ...registries.flatMap(registry => [
      registry.password,
      registry.staticToken,
      registry.urlPasswordEncoded,
      registry.urlPasswordDecoded,
      ...(registry.issued ? [...registry.issued] : []),
    ]),
  ]
    .filter(secret => typeof secret === 'string' && secret.length > 1)
    .sort((a, b) => b.length - a.length);

  return secrets.reduce(
    (text, secret) => text.split(secret).join('[REDACTED]'),
    String(value),
  );
}

function control(registry, action, payload, res) {
  switch (action) {
    case 'fail':
      registry.state = 'fail';
      break;
    case 'recover':
      registry.state = 'ok';
      break;
    case 'add-tag': {
      // A second, different image under the first repo: drift detection
      // should report it, and the drift details quote the repository name.
      const repo = registry.repos.find(r => !r.broken && r.images.length > 0);
      if (!repo) {
        return sendJson(res, 400, { error: 'no repository to tag' });
      }
      const credentialFor = repo.images[0].credentialFor;
      repo.images.push(
        withCredentialFor(
          makeEE({
            tag: 'v2',
            labels: { 'org.opencontainers.image.version': 'drift' },
          }),
          credentialFor,
        ),
      );
      break;
    }
    case 'set-password': {
      if (registry.mode !== 'basic') {
        return sendJson(res, 400, {
          error: 'set-password applies to lab-basic only',
        });
      }
      const password = payload?.password;
      if (typeof password !== 'string' || password.length < 2) {
        return sendJson(res, 400, { error: 'password required' });
      }
      registry.password = password;
      // Rotate the hostile data with the credential: clean repository names
      // during the window where the portal still holds the old password, so
      // the interim 401 diagnostics carry no credential the portal cannot
      // redact. After the portal restarts with the new password, the
      // payloads quote it and the boundary is exercised against the new
      // value.
      registry.repos = [
        {
          name: 'demo/rotated-ee',
          broken: false,
          images: [
            withCredentialFor(makeEE({ tag: 'v1' }), () => registry.password),
          ],
        },
        {
          name: 'demo/network-ee',
          broken: false,
          images: [makeEE({ tag: 'v1', clean: true })],
        },
      ];
      break;
    }
    default:
      return sendJson(res, 400, { error: `unknown action: ${action}` });
  }
  sendJson(res, 200, statusBody());
}

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
  });
}

async function handle(registry, req, res) {
  const url = new URL(req.url, `http://${HOST}:${registry.port}`);
  const path = url.pathname;

  if (path === '/__lab/status') {
    return sendJson(res, 200, statusBody());
  }
  if (path === '/__lab/control') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'POST required' });
    }
    const body = await readBody(req);
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid JSON' });
    }
    const target = registries.find(r => r.name === parsed.registry);
    if (!target) {
      return sendJson(res, 404, {
        error: `unknown registry: ${parsed.registry}`,
      });
    }
    return control(target, parsed.action, parsed, res);
  }
  if (path === '/token') {
    registry.requests += 1;
    return serveTokenEndpoint(registry, req, res);
  }
  if (path === '/v2' || path.startsWith('/v2/')) {
    registry.requests += 1;
    return handleApi(registry, req, res, path);
  }

  return notFound(res);
}

function logLine(registry, req, res) {
  const original = res.writeHead.bind(res);
  res.writeHead = (status, headers) => {
    console.log(
      redactFixtureLog(`${registry.name} ${req.method} ${req.url} ${status}`),
    );
    return original(status, headers);
  };
}

for (const registry of registries) {
  const server = http.createServer((req, res) => {
    logLine(registry, req, res);
    handle(registry, req, res).catch(error => {
      console.error(
        redactFixtureLog(`${registry.name} handler error: ${String(error)}`),
      );
      if (!res.headersSent)
        sendJson(res, 500, { errors: [{ code: 'INTERNAL' }] });
    });
  });
  server.listen(registry.port, HOST, () => {
    console.log(
      `${registry.name} listening on http://${HOST}:${registry.port} (${registry.mode})`,
    );
  });
}

console.log('control plane: GET /__lab/status, POST /__lab/control');
