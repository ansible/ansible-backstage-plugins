import { DigestCache, digestKey } from './DigestCache';
import {
  ArtifactRef,
  Descriptor,
  ImageConfig,
  Manifest,
  MANIFEST_ACCEPT,
  MediaTypes,
  RegistryConnection,
  RegistryError,
  ResolvedArtifact,
  isIndex,
} from './types';

/** Injected so tests can drive the client without a network. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<Response>;

export interface OCIClientOptions {
  fetch?: FetchLike;
  /** Per-request timeout. */
  timeoutMs?: number;
  logger?: { debug(msg: string): void; warn(msg: string): void };
  /**
   * Cache for digest-addressed reads only. Tag lookups are never cached — a tag is a
   * mutable pointer, and caching one is how a catalog starts lying about an image.
   */
  cache?: DigestCache;
}

interface AuthChallenge {
  realm: string;
  service?: string;
  scope?: string;
}

/**
 * Upper bound for a single blob download. Blob descriptors are registry
 * controlled; anything declaring more than this is refused rather than read
 * into memory.
 */
const MAX_BLOB_BYTES = 512 * 1024 * 1024;

/**
 * Parse the `k="v"` parameters of a challenge header.
 *
 * Quote-aware scanning instead of a `matchAll` regex: the header is registry
 * controlled, and backtracking patterns like `(\w+)="([^"]*)"` run in
 * polynomial time on hostile input. Splitting on commas would break values
 * that legitimately contain one, so the scan tracks quotes explicitly.
 */
function parseChallengeParams(input: string): Record<string, string> {
  const params: Record<string, string> = {};
  let i = 0;
  while (i < input.length) {
    const eq = input.indexOf('="', i);
    if (eq < 0) break;
    // The key is the word-character run immediately before `="`.
    let keyStart = eq;
    while (keyStart > i && /\w/.test(input[keyStart - 1])) keyStart--;
    const key = input.slice(keyStart, eq);
    let valueEnd = eq + 2;
    while (valueEnd < input.length && input[valueEnd] !== '"') valueEnd++;
    if (key) params[key] = input.slice(eq + 2, valueEnd);
    i = valueEnd + 1;
  }
  return params;
}

/**
 * A client for the OCI Distribution Specification v2.
 *
 * Scope is deliberately narrow: metadata only. There is no blob streaming to consumers
 * because the Portal is never in the artifact data path — Controller, EDA and podman pull
 * from the registry directly. The only blob this client fetches is the image config,
 * which is metadata that happens to be stored as a blob.
 *
 * Nothing here knows what an execution environment or a collection is.
 */
export class OCIClient {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly logger?: OCIClientOptions['logger'];
  private readonly cache?: DigestCache;
  /** Bearer tokens from the token-exchange flow, keyed by scope. */
  private readonly tokenCache = new Map<
    string,
    { token: string; expiresAt: number }
  >();
  /** Shared so concurrent requests prime once rather than racing. */
  private priming?: Promise<void>;

  constructor(
    private readonly connection: RegistryConnection,
    options: OCIClientOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.logger = options.logger;
    this.cache = options.cache;
  }

  get registryName(): string {
    return this.connection.name;
  }

  private get base(): string {
    // Trim trailing slashes without a regex — the URL is configuration data, and
    // `replace(/\/+$/, '')` is a polynomial-time pattern on hostile input.
    let url = this.connection.url;
    while (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /**
   * Parse a `WWW-Authenticate` challenge.
   *
   * Example: Bearer realm="https://auth.docker.io/token",service="registry.docker.io",
   *          scope="repository:library/nginx:pull"
   */
  static parseChallenge(header: string): AuthChallenge | undefined {
    const trimmed = header.trim();
    // Literal prefix test — `\s+(.*)`-style regexes are polynomial on hostile input.
    if (!/^Bearer /i.test(trimmed)) return undefined;

    const params = parseChallengeParams(trimmed.slice(7));
    return params.realm
      ? { realm: params.realm, service: params.service, scope: params.scope }
      : undefined;
  }

  private basicHeader(): string | undefined {
    const { auth } = this.connection;
    if (auth.type !== 'basic' || !auth.username) return undefined;
    const raw = `${auth.username}:${auth.password ?? ''}`;
    return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
  }

  /** Exchange credentials for a scoped bearer token, caching the result. */
  private async fetchBearerToken(
    challenge: AuthChallenge,
  ): Promise<string | undefined> {
    const cacheKey = challenge.scope ?? '<registry>';
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const url = new URL(challenge.realm);

    // The realm is advertised by the registry and is therefore untrusted input.
    // Refuse anything that is not plain HTTP(S) — a `file:` or `data:` realm
    // would direct the credential-bearing request somewhere it must never go —
    // and refuse a plaintext realm for an HTTPS registry, where sending Basic
    // credentials would leak them to a network observer.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      this.logger?.warn(
        `[${this.connection.name}] refusing auth realm with protocol ` +
          `${url.protocol}`,
      );
      return undefined;
    }
    if (url.protocol === 'http:' && new URL(this.base).protocol === 'https:') {
      this.logger?.warn(
        `[${this.connection.name}] refusing non-TLS auth realm ` +
          `${url.toString()}`,
      );
      return undefined;
    }

    // The advertised realm host may be unreachable from here — a registry configured
    // as `localhost` reached from inside a container, for instance. Only ever done
    // when explicitly enabled, since this changes where credentials are sent.
    if (this.connection.rewriteAuthRealmHost) {
      const target = new URL(this.base);
      if (url.host !== target.host) {
        this.logger?.debug(
          `[${this.connection.name}] rewriting auth realm host ${url.host} -> ${target.host}`,
        );
        url.protocol = target.protocol;
        url.host = target.host;
      }
    }

    if (challenge.service) url.searchParams.set('service', challenge.service);
    if (challenge.scope) url.searchParams.set('scope', challenge.scope);

    const headers: Record<string, string> = { Accept: 'application/json' };
    const basic = this.basicHeader();
    if (basic) headers.Authorization = basic;

    // Under the shared timeout like every other request: a stalled token
    // endpoint would otherwise hang the shared priming promise and every
    // request waiting on it.
    const res = await this.withTimeout(signal =>
      this.fetchImpl(url.toString(), { headers, signal } as never),
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger?.warn(
        `[${this.connection.name}] token exchange failed: ${
          res.status
        } ${url.toString()} — ${detail}`,
      );
      return undefined;
    }

    const body = (await res.json()) as {
      token?: string;
      access_token?: string;
      expires_in?: number;
    };
    const token = body.token ?? body.access_token;
    if (!token) return undefined;

    // Renew a little early to avoid racing expiry mid-sync.
    const ttl = (body.expires_in ?? 300) * 1000;
    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + ttl - 10_000,
    });
    return token;
  }

  private staticAuthHeader(): string | undefined {
    const { auth } = this.connection;
    if (auth.type === 'bearer' && auth.token) return `Bearer ${auth.token}`;
    if (auth.type === 'basic') return this.basicHeader();
    return undefined;
  }

  /**
   * Acquire a token before the first real request, priming from `/v2/`.
   *
   * Sent **anonymously**, on purpose. Quay's `/v2/` accepts Bearer tokens only:
   * presenting Basic credentials there earns `400 Invalid bearer token format` rather
   * than a challenge, and a 400 carries no `WWW-Authenticate` header to learn from — so
   * sending credentials eagerly is exactly what prevents this client from discovering
   * where to exchange them. Priming anonymously is what podman does.
   *
   * Registries are also inconsistent about *where* they challenge: Quay challenges on
   * `/v2/` but can answer a bare 401 with no challenge on repository paths, so a client
   * that waits to be challenged by its first real request may never learn the realm.
   *
   * Runs once per client; the result is shared by every later request.
   */
  private async primeAuth(): Promise<void> {
    if (!this.priming) {
      this.priming = (async () => {
        try {
          const res = await this.withTimeout(signal =>
            this.fetchImpl(`${this.base}/v2/`, {
              headers: {},
              signal,
            } as never),
          );
          if (res.status !== 401) return; // anonymous access, or an unexpected answer
          const header = res.headers.get('www-authenticate');
          const challenge = header
            ? OCIClient.parseChallenge(header)
            : undefined;
          // Drop the scope: priming only discovers the realm and service. Some
          // registries (GHCR) embed a placeholder scope ("repository:user/image:pull")
          // in the /v2/ challenge that fails token exchange. Real scopes come from
          // per-request 401 challenges.
          if (challenge)
            await this.fetchBearerToken({ ...challenge, scope: undefined });
        } catch (error) {
          // Priming is best effort. A registry that cannot be reached here will fail
          // the real request too, with a better message than this one could give.
          this.logger?.debug(
            `[${this.connection.name}] auth priming skipped: ${String(error)}`,
          );
        }
      })();
    }
    return this.priming;
  }

  /** A token acquired by priming, if any, regardless of scope. */
  private primedToken(): string | undefined {
    for (const entry of this.tokenCache.values()) {
      if (entry.expiresAt > Date.now()) return entry.token;
    }
    return undefined;
  }

  /**
   * Resolve a request path to a URL, refusing absolute URLs that point away
   * from the configured registry.
   *
   * Pagination `Link` headers are registry controlled; without this check a
   * hostile registry could direct a credential-bearing request at any host.
   * The auth realm is exempt — it is fetched separately, by design, since
   * registries legitimately use separate auth hosts.
   */
  private resolveUrl(path: string): string {
    if (!path.startsWith('http')) return `${this.base}${path}`;
    try {
      const target = new URL(path);
      const origin = new URL(this.base);
      if (target.origin !== origin.origin) {
        throw new Error(
          `absolute URL ${target.origin} is not the configured registry ` +
            `${origin.origin}`,
        );
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`invalid absolute URL: ${path}`);
      }
      throw error;
    }
    return path;
  }

  /**
   * Issue a request, transparently handling a 401 bearer challenge.
   *
   * Registries differ in whether they challenge per-endpoint or per-scope, so the retry
   * is driven by the challenge the server actually sends rather than assumed up front.
   */
  async request(
    path: string,
    init: { method?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = this.resolveUrl(path);
    const headers: Record<string, string> = { ...(init.headers ?? {}) };

    await this.primeAuth();

    // A primed bearer token wins over static credentials: a registry that issued one
    // is a registry that wants to be addressed with it.
    const primed = this.primedToken();
    const staticAuth = primed ? `Bearer ${primed}` : this.staticAuthHeader();
    if (staticAuth) headers.Authorization = staticAuth;

    let res = await this.withTimeout(signal =>
      this.fetchImpl(url, { ...init, headers, signal } as never),
    );

    if (res.status === 401) {
      const challengeHeader = res.headers.get('www-authenticate');
      const challenge = challengeHeader
        ? OCIClient.parseChallenge(challengeHeader)
        : undefined;
      if (challenge) {
        const token = await this.fetchBearerToken(challenge);
        if (token) {
          res = await this.withTimeout(signal =>
            this.fetchImpl(url, {
              ...init,
              headers: { ...headers, Authorization: `Bearer ${token}` },
              signal,
            } as never),
          );
        }
      }
    }
    return res;
  }

  /**
   * Run a request under a timeout.
   *
   * `AbortSignal.timeout` is not universally available — notably absent under jsdom —
   * so fall back to an explicit controller. The timer is always cleared, otherwise a
   * long-lived sync would accumulate pending handles.
   */
  private async withTimeout<T>(
    run: (signal: AbortSignal | undefined) => Promise<T>,
  ): Promise<T> {
    if (
      typeof AbortSignal !== 'undefined' &&
      typeof AbortSignal.timeout === 'function'
    ) {
      return run(AbortSignal.timeout(this.timeoutMs));
    }
    if (typeof AbortController === 'undefined') {
      return run(undefined);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Distribution v2 endpoints
  // -------------------------------------------------------------------------

  /**
   * Issue a request *without* the 401 retry.
   *
   * Needed by capability probing, which has to observe the authentication challenge
   * itself. `request()` transparently satisfies the challenge and returns the retried
   * response, by which point the `WWW-Authenticate` header is gone.
   */
  async rawRequest(
    path: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      /** Set false to send no credentials — required when observing a challenge. */
      auth?: boolean;
    } = {},
  ): Promise<Response> {
    const url = this.resolveUrl(path);
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    const staticAuth =
      init.auth === false ? undefined : this.staticAuthHeader();
    if (staticAuth) headers.Authorization = staticAuth;
    return this.withTimeout(signal =>
      this.fetchImpl(url, { ...init, headers, signal } as never),
    );
  }

  /**
   * `GET /v2/` — the API version check, and the endpoint that advertises the auth
   * scheme. Uses `rawRequest` so the challenge survives for the caller to inspect.
   */
  async ping(): Promise<{ ok: boolean; status: number; challenge?: string }> {
    // Anonymously, on purpose. This call exists to observe the authentication
    // challenge, and presenting credentials is precisely what suppresses it: Quay
    // answers Basic-on-/v2/ with `400 Invalid bearer token format` and no
    // WWW-Authenticate header, so a probe that authenticates learns nothing and
    // reports the registry as anonymous.
    const res = await this.rawRequest('/v2/', { auth: false });
    return {
      ok: res.ok || res.status === 401,
      status: res.status,
      challenge: res.headers.get('www-authenticate') ?? undefined,
    };
  }

  /**
   * Whether `GET /v2/_catalog` is actually served.
   *
   * This cannot be inferred from an empty enumeration: a disabled catalog and an empty
   * one both yield zero repositories. Only the status code distinguishes them.
   */
  async supportsCatalog(): Promise<boolean> {
    const res = await this.request('/v2/_catalog?n=1', {
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  }

  /**
   * `GET /v2/_catalog` — repository enumeration. Frequently disabled on hosted
   * registries, so callers must tolerate an empty result and fall back to a configured
   * repository list.
   */
  async *listRepositories(pageSize = 100): AsyncGenerator<string> {
    let path: string | undefined = `/v2/_catalog?n=${pageSize}`;
    while (path) {
      const res: Response = await this.request(path, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        if (res.status === 404 || res.status === 401 || res.status === 403)
          return;
        throw new RegistryError(
          `catalog listing failed: ${res.status}`,
          res.status,
          this.connection.name,
        );
      }
      const body = (await res.json()) as { repositories?: string[] };
      for (const repo of body.repositories ?? []) yield repo;
      path = nextLink(res.headers.get('link'));
    }
  }

  /** `GET /v2/{name}/tags/list`, following Link-header pagination. */
  async *listTags(repository: string, pageSize = 100): AsyncGenerator<string> {
    let path: string | undefined = `/v2/${repository}/tags/list?n=${pageSize}`;
    while (path) {
      const res: Response = await this.request(path, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        if (res.status === 404) return;
        throw new RegistryError(
          `tag listing failed for ${repository}: ${res.status}`,
          res.status,
          this.connection.name,
        );
      }
      const body = (await res.json()) as { tags?: string[] | null };
      for (const tag of body.tags ?? []) yield tag;
      path = nextLink(res.headers.get('link'));
    }
  }

  /**
   * `HEAD /v2/{name}/manifests/{ref}` — resolve a reference to its immutable digest
   * without transferring the manifest. This is the cheap primitive drift detection
   * polls with.
   */
  async headManifest(
    repository: string,
    reference: string,
  ): Promise<{ digest?: string; mediaType?: string; status: number }> {
    const res = await this.request(`/v2/${repository}/manifests/${reference}`, {
      method: 'HEAD',
      headers: { Accept: MANIFEST_ACCEPT },
    });
    return {
      digest: res.headers.get('docker-content-digest') ?? undefined,
      mediaType: res.headers.get('content-type') ?? undefined,
      status: res.status,
    };
  }

  /**
   * `GET /v2/{name}/manifests/{ref}` — resolve a reference to a full artifact.
   *
   * Cached only when the reference is a digest. Resolving a *tag* must always hit the
   * registry: that lookup is exactly how tag movement is detected.
   */
  async getManifest(
    repository: string,
    reference: string,
  ): Promise<ResolvedArtifact> {
    const byDigest = reference.startsWith('sha256:');
    const key = byDigest
      ? digestKey(this.connection.name, repository, 'manifest', reference)
      : undefined;

    if (key) {
      const cached = this.cache?.get<ResolvedArtifact>(key);
      if (cached) return cached;
    }

    const res = await this.request(`/v2/${repository}/manifests/${reference}`, {
      headers: { Accept: MANIFEST_ACCEPT },
    });
    if (!res.ok) {
      throw new RegistryError(
        `manifest fetch failed for ${repository}:${reference}: ${res.status}`,
        res.status,
        this.connection.name,
      );
    }

    const raw = await res.text();
    const manifest = JSON.parse(raw) as Manifest;
    // Prefer the registry's digest header; fall back to the reference when it is
    // already a digest. Computing it locally would need a hash of the exact bytes.
    const digest =
      res.headers.get('docker-content-digest') ??
      (reference.startsWith('sha256:') ? reference : '');

    const resolved: ResolvedArtifact = {
      registry: this.connection.name,
      repository,
      reference,
      digest,
      mediaType:
        res.headers.get('content-type') ??
        manifest.mediaType ??
        MediaTypes.ociManifest,
      manifest,
      size: raw.length,
    };
    if (key) this.cache?.set(key, resolved, raw.length);
    return resolved;
  }

  /**
   * Fetch and parse an image config blob.
   *
   * This is where OCI image labels live. Reading them costs one GET plus a parse *per
   * manifest* — the dominant per-image fetch cost in enumeration. Config blobs are
   * immutable by digest, so results can be cached permanently against that digest,
   * which turns a per-sync cost into a one-off per image version.
   */
  async getConfigBlob(
    repository: string,
    configDescriptor: Descriptor,
  ): Promise<ImageConfig | undefined> {
    const key = digestKey(
      this.connection.name,
      repository,
      'config',
      configDescriptor.digest,
    );
    const cached = this.cache?.get<ImageConfig>(key);
    if (cached) return cached;

    const res = await this.request(
      `/v2/${repository}/blobs/${configDescriptor.digest}`,
      { headers: { Accept: configDescriptor.mediaType } },
    );
    if (!res.ok) {
      this.logger?.debug(
        `[${this.connection.name}] config blob ${configDescriptor.digest} → ${res.status}`,
      );
      return undefined;
    }
    try {
      const config = (await res.json()) as ImageConfig;
      this.cache?.set(key, config, configDescriptor.size ?? 0);
      return config;
    } catch {
      return undefined;
    }
  }

  /**
   * `GET /v2/{name}/referrers/{digest}` — OCI 1.1 referrers.
   *
   * Registries that predate OCI 1.1 return 404. The spec defines a fallback where
   * referrers are published under a tag derived from the subject digest
   * (`sha256-<hex>`), so that is attempted before giving up. Callers distinguish the
   * two via the capability profile.
   */
  async getReferrers(
    repository: string,
    digest: string,
    artifactType?: string,
  ): Promise<{
    referrers: Descriptor[];
    via: 'native' | 'tag-fallback' | 'none';
  }> {
    const query = artifactType
      ? `?artifactType=${encodeURIComponent(artifactType)}`
      : '';
    const res = await this.request(
      `/v2/${repository}/referrers/${digest}${query}`,
      {
        headers: { Accept: MediaTypes.ociIndex },
      },
    );

    if (res.ok) {
      const index = (await res.json()) as { manifests?: Descriptor[] };
      return { referrers: index.manifests ?? [], via: 'native' };
    }

    // Fallback tag schema: sha256:abc… → sha256-abc…
    const fallbackTag = digest.replace(':', '-');
    try {
      const artifact = await this.getManifest(repository, fallbackTag);
      if (isIndex(artifact.manifest)) {
        return { referrers: artifact.manifest.manifests, via: 'tag-fallback' };
      }
    } catch {
      // No fallback tag — the registry genuinely has no referrers for this subject.
    }
    return { referrers: [], via: 'none' };
  }

  /** Fetch a referrer's payload — used to read a build-time content manifest. */
  async getReferrerPayload(
    repository: string,
    descriptor: Descriptor,
  ): Promise<unknown | undefined> {
    const artifact = await this.getManifest(
      repository,
      descriptor.digest,
    ).catch(() => undefined);
    if (!artifact || isIndex(artifact.manifest)) return undefined;

    const layer = artifact.manifest.layers?.[0];
    if (!layer) return undefined;

    const res = await this.request(`/v2/${repository}/blobs/${layer.digest}`, {
      headers: { Accept: layer.mediaType },
    });
    if (!res.ok) return undefined;
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }

  /**
   * Fetch a blob by digest, cached.
   *
   * Used for layer payloads such as the content manifest. Immutable by digest, so an
   * unchanged image never re-downloads its 374 KB inventory on a later sync.
   */
  async getBlob(
    repository: string,
    descriptor: Descriptor,
  ): Promise<Buffer | undefined> {
    // The descriptor is registry controlled. Refuse to download anything
    // beyond a sane bound before it can exhaust memory.
    if (descriptor.size !== undefined && descriptor.size > MAX_BLOB_BYTES) {
      this.logger?.warn(
        `[${this.connection.name}] refusing blob ${descriptor.digest}: ` +
          `declared size ${descriptor.size} exceeds ${MAX_BLOB_BYTES} bytes`,
      );
      return undefined;
    }
    const key = digestKey(
      this.connection.name,
      repository,
      'blob',
      descriptor.digest,
    );
    const cached = this.cache?.get<Buffer>(key);
    if (cached) return cached;

    const res = await this.request(
      `/v2/${repository}/blobs/${descriptor.digest}`,
      {
        headers: { Accept: descriptor.mediaType },
      },
    );
    if (!res.ok) return undefined;

    const buffer = Buffer.from(await res.arrayBuffer());
    this.cache?.set(key, buffer, buffer.length);
    return buffer;
  }

  /** Build a pull reference a user can hand to podman. Portal never proxies this. */
  pullReference(ref: ArtifactRef): string {
    const host = this.base.replace(/^https?:\/\//, '');
    const sep = ref.reference.startsWith('sha256:') ? '@' : ':';
    return `${host}/${ref.repository}${sep}${ref.reference}`;
  }
}

/** Extract the `rel="next"` target from a Link header, per RFC 5988. */
export function nextLink(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith('<')) continue;
    const close = trimmed.indexOf('>');
    if (close < 0) continue;
    const target = trimmed.slice(1, close);
    // Remaining segments are `;`-separated parameters; `rel` may be a
    // space-separated list. Scanned manually — the value is registry
    // controlled, and backtracking regexes are polynomial on hostile input.
    for (const param of trimmed.slice(close + 1).split(';')) {
      const eq = param.indexOf('=');
      if (eq < 0) continue;
      if (param.slice(0, eq).trim().toLowerCase() !== 'rel') continue;
      let value = param.slice(eq + 1).trim();
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (value.toLowerCase().split(' ').includes('next')) return target;
    }
  }
  return undefined;
}
