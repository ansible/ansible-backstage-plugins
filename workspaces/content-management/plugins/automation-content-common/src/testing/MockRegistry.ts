import type { FetchLike } from '../oci/OCIClient';
import { Descriptor, ImageConfig, Manifest, MediaTypes } from '../oci/types';

export interface MockImage {
  tag: string;
  digest: string;
  manifest: Manifest;
  config?: ImageConfig;
  /** Referrers keyed by subject digest, exposed per the registry's referrer mode. */
  referrers?: Descriptor[];
  /** Payloads for referrer descriptors, keyed by descriptor digest. */
  referrerPayloads?: Record<string, unknown>;
}

export interface MockRegistryOptions {
  /** Repository name → images. */
  repositories: Record<string, MockImage[]>;
  /** `_catalog` availability. Many hosted registries disable it. */
  catalogEnabled?: boolean;
  /** How referrers are served, if at all. */
  referrersMode?: 'native' | 'tag-fallback' | 'none';
  /** Emit Link headers on tag listings. */
  paginate?: boolean;
  /** Auth behaviour. `bearer-challenge` exercises the 401 → token → retry flow. */
  auth?: 'anonymous' | 'bearer-challenge' | 'basic-required';
  /** Omit Docker-Content-Digest, as some registries do. */
  omitDigestHeader?: boolean;
  /** Config blob fetches to fail, keyed by digest — for degradation tests. */
  failConfigBlobs?: string[];
}

/**
 * An in-memory OCI Distribution v2 registry.
 *
 * The point of this helper is not convenience — it is that registry capabilities are
 * configurable, so "degrades gracefully against a minimal registry" can be asserted
 * rather than claimed. A registry with `catalogEnabled: false`, `referrersMode: 'none'`
 * and `paginate: false` is the honest worst case the design must survive.
 */
export class MockRegistry {
  readonly requests: Array<{ method: string; path: string }> = [];
  private tokenIssued = 0;

  constructor(
    private readonly options: MockRegistryOptions,
    private readonly host = 'https://mock.registry',
  ) {}

  get tokensIssued(): number {
    return this.tokenIssued;
  }

  /** Count requests whose path contains a fragment — used for cost assertions. */
  countRequests(fragment: string): number {
    return this.requests.filter(r => r.path.includes(fragment)).length;
  }

  reset(): void {
    this.requests.length = 0;
    this.tokenIssued = 0;
  }

  /** A `FetchLike` suitable for injecting into OCIClient. */
  get fetch(): FetchLike {
    return async (url, init) => this.handle(url, init);
  }

  private json(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  }

  private notFound(): Response {
    return new Response(JSON.stringify({ errors: [{ code: 'NOT_FOUND' }] }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  private async handle(
    rawUrl: string,
    init?: { method?: string; headers?: Record<string, string> },
  ): Promise<Response> {
    const url = new URL(rawUrl);
    const path = url.pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
    this.requests.push({ method, path: path + url.search });

    // Token endpoint for the bearer-challenge flow.
    if (path === '/token') {
      this.tokenIssued += 1;
      return this.json({ token: 'mock-token', expires_in: 300 });
    }

    const authHeader =
      init?.headers?.Authorization ?? init?.headers?.authorization;

    if (
      this.options.auth === 'bearer-challenge' &&
      !authHeader?.startsWith('Bearer ')
    ) {
      return new Response('unauthorized', {
        status: 401,
        headers: {
          'www-authenticate': `Bearer realm="${this.host}/token",service="mock",scope="repository:*:pull"`,
        },
      });
    }
    if (
      this.options.auth === 'basic-required' &&
      !authHeader?.startsWith('Basic ')
    ) {
      return new Response('unauthorized', {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="mock"' },
      });
    }

    if (path === '/v2/' || path === '/v2') {
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (path === '/v2/_catalog') {
      if (!this.options.catalogEnabled) return this.notFound();
      return this.json({
        repositories: Object.keys(this.options.repositories),
      });
    }

    const tagsMatch = /^\/v2\/(.+)\/tags\/list$/.exec(path);
    if (tagsMatch) {
      const images = this.options.repositories[tagsMatch[1]];
      if (!images) return this.notFound();
      const headers: Record<string, string> = {};
      // Only advertise a next page when one plausibly exists.
      const n = Number(url.searchParams.get('n') ?? '0');
      if (
        this.options.paginate &&
        n > 0 &&
        images.length > n &&
        !url.searchParams.get('last')
      ) {
        headers.link = `<${this.host}/v2/${
          tagsMatch[1]
        }/tags/list?n=${n}&last=${images[n - 1].tag}>; rel="next"`;
        return this.json(
          { name: tagsMatch[1], tags: images.slice(0, n).map(i => i.tag) },
          { headers },
        );
      }
      const last = url.searchParams.get('last');
      const start = last ? images.findIndex(i => i.tag === last) + 1 : 0;
      return this.json({
        name: tagsMatch[1],
        tags: images.slice(start).map(i => i.tag),
      });
    }

    const referrersMatch = /^\/v2\/(.+)\/referrers\/(.+)$/.exec(path);
    if (referrersMatch) {
      if (this.options.referrersMode !== 'native') return this.notFound();
      const image = this.findByDigest(referrersMatch[1], referrersMatch[2]);
      return this.json({
        schemaVersion: 2,
        mediaType: MediaTypes.ociIndex,
        manifests: image?.referrers ?? [],
      });
    }

    const manifestMatch = /^\/v2\/(.+)\/manifests\/(.+)$/.exec(path);
    if (manifestMatch) {
      const [, repo, reference] = manifestMatch;
      return this.serveManifest(repo, reference, method);
    }

    const blobMatch = /^\/v2\/(.+)\/blobs\/(.+)$/.exec(path);
    if (blobMatch) {
      const [, repo, digest] = blobMatch;
      if (this.options.failConfigBlobs?.includes(digest)) {
        return new Response('blob unavailable', { status: 500 });
      }
      const images = this.options.repositories[repo] ?? [];
      for (const image of images) {
        const manifest = image.manifest as { config?: Descriptor };
        if (manifest.config?.digest === digest && image.config) {
          return this.json(image.config);
        }
        const payload = image.referrerPayloads?.[digest];
        if (payload !== undefined) return this.json(payload);
      }
      return this.notFound();
    }

    return this.notFound();
  }

  private serveManifest(
    repo: string,
    reference: string,
    method: string,
  ): Response {
    const images = this.options.repositories[repo] ?? [];

    // Tag-fallback referrers: sha256:abc… is published under the tag sha256-abc…
    if (
      this.options.referrersMode === 'tag-fallback' &&
      reference.startsWith('sha256-')
    ) {
      const subject = reference.replace('sha256-', 'sha256:');
      const image = this.findByDigest(repo, subject);
      if (image?.referrers) {
        return this.json(
          {
            schemaVersion: 2,
            mediaType: MediaTypes.ociIndex,
            manifests: image.referrers,
          },
          { headers: { 'content-type': MediaTypes.ociIndex } },
        );
      }
      return this.notFound();
    }

    const image =
      images.find(i => i.tag === reference) ??
      images.find(i => i.digest === reference);

    // Referrer descriptors are themselves addressable manifests.
    if (!image) {
      for (const candidate of images) {
        const descriptor = candidate.referrers?.find(
          r => r.digest === reference,
        );
        if (descriptor) {
          const payloadDigest = Object.keys(
            candidate.referrerPayloads ?? {},
          )[0];
          return this.json(
            {
              schemaVersion: 2,
              mediaType: MediaTypes.ociManifest,
              artifactType: descriptor.artifactType,
              config: {
                mediaType: MediaTypes.ociConfig,
                digest: 'sha256:empty',
                size: 2,
              },
              layers: payloadDigest
                ? [
                    {
                      mediaType:
                        'application/vnd.ansible.content-manifest.v1+json',
                      digest: payloadDigest,
                      size: 1,
                    },
                  ]
                : [],
            },
            {
              headers: {
                'content-type': MediaTypes.ociManifest,
                ...(this.options.omitDigestHeader
                  ? {}
                  : { 'docker-content-digest': descriptor.digest }),
              },
            },
          );
        }
      }
      return this.notFound();
    }

    const headers: Record<string, string> = {
      'content-type': image.manifest.mediaType ?? MediaTypes.ociManifest,
    };
    if (!this.options.omitDigestHeader) {
      headers['docker-content-digest'] = image.digest;
    }

    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }
    return new Response(JSON.stringify(image.manifest), {
      status: 200,
      headers,
    });
  }

  private findByDigest(repo: string, digest: string): MockImage | undefined {
    return (this.options.repositories[repo] ?? []).find(
      i => i.digest === digest,
    );
  }
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

export function makeImage(
  overrides: Partial<MockImage> & { tag: string },
): MockImage {
  const digest =
    overrides.digest ?? `sha256:${overrides.tag.padEnd(64, '0').slice(0, 64)}`;
  const configDigest = `sha256:${`cfg${overrides.tag}`
    .padEnd(64, '0')
    .slice(0, 64)}`;
  return {
    digest,
    manifest: {
      schemaVersion: 2,
      mediaType: MediaTypes.ociManifest,
      config: {
        mediaType: MediaTypes.ociConfig,
        digest: configDigest,
        size: 100,
      },
      layers: [
        {
          mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
          digest: 'sha256:l1',
          size: 1000,
        },
      ],
    },
    ...overrides,
  };
}

/** An image carrying Ansible collection metadata in OCI config labels — ladder level 2. */
export function makeLabelledImage(
  tag: string,
  labels: Record<string, string>,
): MockImage {
  const image = makeImage({ tag });
  return {
    ...image,
    config: { architecture: 'amd64', os: 'linux', config: { Labels: labels } },
  };
}
