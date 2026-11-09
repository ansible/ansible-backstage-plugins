import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';

/** Provenance of a content inventory. Fidelity varies, so the UI must show it. */
export interface Enumeration {
  status: 'complete' | 'partial' | 'unknown';
  source:
    | 'build-time-manifest'
    | 'labels'
    | 'blob-fetch'
    | 'external-introspection';
  ansibleCore?: string;
  extractedAt?: string;
}

export interface ContentCounts {
  collections?: number;
  plugins?: number;
  pluginsByType?: Record<string, number>;
  roles?: number;
  playbooks?: number;
  edaPlugins?: number;
  rulebooks?: number;
}

/** Indexed artifact classifications exposed by the content service. */
export type ArtifactType =
  | 'execution-environment'
  | 'skill'
  | 'collection'
  | 'oci-image';

export interface ExecutionEnvironment {
  ref: string;
  /** Result of classification; unclaimed images are not shown in typed lists. */
  type?: ArtifactType;
  /** OCI image annotations exposed by the API for older stored records. */
  annotations?: Record<string, string>;
  /** OCI metadata is returned as a nested object by the content API. */
  metadata?: {
    title?: string;
    description?: string;
    version?: string;
    source?: string;
  };
  /** Legacy top-level values retained for older API responses. */
  description?: string;
  version?: string;
  classification?: { type: string; confidence: string; signals: string[] };
  registry: string;
  repository: string;
  digest: string;
  tags: string[];
  pullReference: string;
  contentsKnown: boolean;
  enumeration: Enumeration;
  /** When the registry this came from was last successfully read. */
  lastReconciledAt?: string;
  counts?: ContentCounts;
  collections: Array<{
    namespace: string;
    name: string;
    version: string;
    fqcn: string;
  }>;
}

export interface Collection {
  namespace: string;
  name: string;
  fqcn: string;
  version: string;
  description?: string;
  repository?: string;
  counts: ContentCounts;
  providedBy: string[];
}

export interface ContentItemSummary {
  version?: string;
  /** Artifact this item was found in. */
  in?: string;
  fqcn: string;
  name: string;
  type: string;
  collection: string;
  collectionVersion: string;
  shortDescription?: string;
  versionAdded?: string;
  deprecated?: boolean;
}

export interface OptionSpec {
  type?: string;
  elements?: string;
  required?: boolean;
  default?: unknown;
  choices?: unknown[];
  description?: string[];
  suboptions?: Record<string, OptionSpec>;
}

export interface ContentItem extends ContentItemSummary {
  // Normalised to arrays by the backend — ansible-doc emits either shape depending on
  // how each collection author wrote the YAML.
  description?: string[] | string;
  author?: string[] | string;
  notes?: string[] | string;
  /** Collection MANIFEST.json and skill frontmatter fields, spread at top level. */
  authors?: string[] | string;
  tags?: string[] | string;
  license?: string[] | string;
  dependencies?: Record<string, string>;
  documentation?: string;
  homepage?: string;
  issues?: string;
  repository?: string;
  compatibility?: string;
  allowedTools?: string[] | string;
  'allowed-tools'?: string[] | string;
  options?: Record<string, OptionSpec>;
  examples?: string;
  returns?: Record<string, unknown>;
  providedBy: string[];
  enumeration: Enumeration;
}

export interface RegistryCapabilities {
  referrers: 'native' | 'tag-fallback' | 'none';
  catalogEnumeration: boolean;
  tagPagination: boolean;
  delete: 'manifest' | 'tag' | 'none' | 'unknown';
  notifications: 'webhook' | 'poll-only';
  auth: string[];
  notes?: string[];
}

export interface Registry {
  name: string;
  url: string;
  /** When this registry was last read, successfully or not. */
  lastReconciledAt?: string;
  /** When it was last cheaply checked for changes. */
  lastCheckedAt?: string;
  lastReconcileOk?: boolean;
  /** Fixed failure summary — the public listing carries no detailed cause. */
  lastReconcileError?: string;
  namespaces?: string[];
  repositories?: string[];
  capabilities?: RegistryCapabilities;
}

/** What an artifact contains: the collections in it, and optionally the items. */
export interface ArtifactContents {
  enumeration: Enumeration;
  classification?: Classification;
  collections: Array<{
    namespace: string;
    name: string;
    version: string;
    fqcn: string;
    counts: ContentCounts;
  }>;
  items: ContentItemSummary[];
}

export interface Classification {
  type: string;
  confidence: 'certain' | 'likely' | 'no';
  signals: string[];
}

export interface AutomationContentApi {
  /** List indexed artifacts, optionally limited to a classification. */
  listArtifacts(type?: ArtifactType): Promise<ExecutionEnvironment[]>;
  /** Retrieve registry metadata for any artifact classification. */
  getArtifact(ref: string): Promise<ExecutionEnvironment>;
  listRegistries(): Promise<Registry[]>;
  listExecutionEnvironments(): Promise<ExecutionEnvironment[]>;
  getExecutionEnvironment(ref: string): Promise<ExecutionEnvironment>;
  getContents(
    ref: string,
    opts?: { depth?: 'direct' | 'flat'; type?: string },
  ): Promise<ArtifactContents>;
  listCollections(query?: string): Promise<Collection[]>;
  searchContentItems(params: {
    q?: string;
    type?: string;
    collection?: string;
    /** Scope to one artifact. */
    in?: string;
    limit?: number;
  }): Promise<{ totalItems: number; items: ContentItemSummary[] }>;
  getContentItem(
    fqcn: string,
    inArtifact?: string,
    itemType?: string,
  ): Promise<ContentItem>;
  /** Re-read every registry and rebuild the index. */
  syncAll(): Promise<SyncResult>;
}

export interface SyncResult {
  status: 'completed' | 'partial';
  durationMs: number;
  refreshedAt?: string;
  registries: Array<{
    registry: string;
    ok: boolean;
    discovered: number;
    error?: string;
  }>;
  cache?: { hits: number; misses: number; entries: number; bytes: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const automationContentApiRef = createApiRef<AutomationContentApi>({
  id: 'plugin.automation-content.service',
});

/**
 * Client for the automation content API.
 *
 * Talks only to the backend's published contract — never to a registry directly. The
 * frontend has no knowledge of OCI, which is what lets the storage backend change
 * without touching the UI.
 */
export class AutomationContentClient implements AutomationContentApi {
  constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  private async baseUrl(): Promise<string> {
    return this.options.discoveryApi.getBaseUrl('automation-content');
  }

  private async post<T>(path: string): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.options.fetchApi.fetch(`${base}${path}`, {
      method: 'POST',
    });
    if (!res.ok && res.status !== 207) {
      throw new Error(
        `Content API request failed: ${res.status} ${res.statusText}`,
      );
    }
    return (await res.json()) as T;
  }

  async syncAll(): Promise<SyncResult> {
    return this.post('/sync');
  }

  private async get<T>(path: string): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.options.fetchApi.fetch(`${base}${path}`);
    if (!res.ok) {
      throw new Error(
        `Content API request failed: ${res.status} ${res.statusText}`,
      );
    }
    return (await res.json()) as T;
  }

  async listRegistries(): Promise<Registry[]> {
    const { items } = await this.get<{ items: Registry[] }>('/registries');
    return items;
  }

  async listExecutionEnvironments(): Promise<ExecutionEnvironment[]> {
    return this.listArtifacts('execution-environment');
  }

  /** List artifacts using the backend classification filter. */
  async listArtifacts(type?: ArtifactType): Promise<ExecutionEnvironment[]> {
    const { items } = await this.get<{ items: ExecutionEnvironment[] }>(
      type ? `/content?type=${encodeURIComponent(type)}` : '/content',
    );
    return items;
  }

  async getExecutionEnvironment(ref: string): Promise<ExecutionEnvironment> {
    return this.getArtifact(ref);
  }

  /** Retrieve the metadata shared by all artifact types. */
  async getArtifact(ref: string): Promise<ExecutionEnvironment> {
    return this.get(`/content/${encodeURIComponent(ref)}`);
  }

  async getContents(
    ref: string,
    opts: { depth?: 'direct' | 'flat'; type?: string } = {},
  ): Promise<ArtifactContents> {
    const search = new URLSearchParams();
    if (opts.depth) search.set('depth', opts.depth);
    if (opts.type) search.set('type', opts.type);
    const suffix = search.toString() ? `?${search}` : '';
    return this.get(`/content/${encodeURIComponent(ref)}/contents${suffix}`);
  }

  async listCollections(query?: string): Promise<Collection[]> {
    const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
    const { items } = await this.get<{ items: Collection[] }>(
      `/collections${suffix}`,
    );
    return items;
  }

  async searchContentItems(params: {
    q?: string;
    type?: string;
    collection?: string;
    in?: string;
    limit?: number;
  }): Promise<{ totalItems: number; items: ContentItemSummary[] }> {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.type) search.set('type', params.type);
    if (params.collection) search.set('collection', params.collection);
    if (params.in) search.set('in', params.in);
    search.set('limit', String(params.limit ?? 100));
    return this.get(`/content-items?${search.toString()}`);
  }

  async getContentItem(
    fqcn: string,
    inArtifact?: string,
    itemType?: string,
  ): Promise<ContentItem> {
    // Scope to the artifact wherever possible: two environments may ship different
    // versions of the same collection, so the documentation genuinely differs.
    const search = new URLSearchParams();
    if (inArtifact) search.set('in', inArtifact);
    if (itemType) search.set('type', itemType);
    const suffix = search.toString() ? `?${search}` : '';
    const body = await this.get<unknown>(
      `/content-items/${encodeURIComponent(fqcn)}${suffix}`,
    );
    // The backend can return multiple variants for one FQCN. Prefer the requested
    // type when supplied; otherwise preserve the historical first-variant fallback.
    if (!isRecord(body)) {
      throw new Error(
        `Content API returned an invalid item response for ${fqcn}`,
      );
    }
    if ('variants' in body) {
      if (!Array.isArray(body.variants)) {
        throw new Error(
          `Content API returned invalid variants for ${fqcn}: expected an array`,
        );
      }
      if (
        !body.variants.every(
          variant => isRecord(variant) && typeof variant.type === 'string',
        )
      ) {
        throw new Error(
          `Content API returned invalid variants for ${fqcn}: each variant must have a type`,
        );
      }
      const variants = body.variants as ContentItem[];
      const selected = itemType
        ? variants.find(variant => variant.type === itemType)
        : variants[0];
      if (!selected) {
        throw new Error(`No documentation found for ${fqcn}`);
      }
      return selected;
    }
    return body as unknown as ContentItem;
  }
}
