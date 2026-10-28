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

export interface ExecutionEnvironment {
  ref: string;
  /** Result of classification — only `execution-environment` has enumerable contents. */
  type?: string;
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
  description?: string[];
  author?: string[];
  notes?: string[];
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
  getContentItem(fqcn: string, inArtifact?: string): Promise<ContentItem>;
  /** Re-read every registry and rebuild the index. */
  syncAll(): Promise<SyncResult>;
  /** Reconcile only the named registry, retaining its previous index on failure. */
  syncRegistry(name: string): Promise<RegistrySyncResult>;
}

/** Result of the backend's single-registry reconciliation endpoint. */
export interface RegistrySyncResult {
  status: 'completed' | 'failed';
  discovered: number;
  retainedPrevious: boolean;
  error?: string;
  lastReconciledAt?: string;
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

export const automationContentApiRef = createApiRef<AutomationContentApi>({
  id: 'plugin.automation-content.service',
});

/** HTTP failure with status retained so pages distinguish missing resources from outages. */
export class ContentApiError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`Content API request failed: ${status} ${statusText}`);
    this.name = 'ContentApiError';
  }
}

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
      throw new ContentApiError(res.status, res.statusText);
    }
    return (await res.json()) as T;
  }

  async syncAll(): Promise<SyncResult> {
    return this.post('/sync');
  }

  async syncRegistry(name: string): Promise<RegistrySyncResult> {
    return this.post(`/registries/${encodeURIComponent(name)}/sync`);
  }

  private async get<T>(path: string): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.options.fetchApi.fetch(`${base}${path}`);
    if (!res.ok) {
      throw new ContentApiError(res.status, res.statusText);
    }
    return (await res.json()) as T;
  }

  async listRegistries(): Promise<Registry[]> {
    const { items } = await this.get<{ items: Registry[] }>('/registries');
    return items;
  }

  async listExecutionEnvironments(): Promise<ExecutionEnvironment[]> {
    const { items } = await this.get<{ items: ExecutionEnvironment[] }>(
      // '/content?type=execution-environment',
      '/content',
    );
    return items;
  }

  async getExecutionEnvironment(ref: string): Promise<ExecutionEnvironment> {
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
  ): Promise<ContentItem> {
    // Scope to the artifact wherever possible: two environments may ship different
    // versions of the same collection, so the documentation genuinely differs.
    const suffix = inArtifact ? `?in=${encodeURIComponent(inArtifact)}` : '';
    const body = await this.get<ContentItem | { variants: ContentItem[] }>(
      `/content-items/${encodeURIComponent(fqcn)}${suffix}`,
    );
    // The backend returns a variants object when the unscoped name matches in
    // more than one artifact — pick the first rather than render an item with
    // no type, options or documentation.
    if ('variants' in body) {
      if (!body.variants.length) {
        throw new Error(`No documentation found for ${fqcn}`);
      }
      return body.variants[0];
    }
    return body;
  }
}
