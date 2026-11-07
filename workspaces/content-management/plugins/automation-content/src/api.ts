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
  /** Stable Backstage catalog entity ref; production producer association is a backend follow-up. */
  definitionEntityRef?: string;
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
  /** Most recent full-registry or row-specific reconciliation attempt. */
  lastReconciledAt?: string;
  /** Whether that last read succeeded — drives the row's sync state. */
  lastReconcileOk?: boolean;
  /**
   * Signature presence in three states: found, provably absent, or not
   * determinable. Evidence lists what was checked — it is never a trust
   * verdict.
   */
  signing?: {
    state: 'signed' | 'not-signed' | 'undetermined';
    evidence: string[];
  };
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
    type: string;
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

export interface ExecutionEnvironmentPage {
  items: ExecutionEnvironment[];
  page: number;
  totalItems: number;
  next: string | null;
}

export interface RepositoryTag {
  tag: string;
  digest: string;
  ref: string;
  /** Registry Last-Modified timestamp for this tag, if exposed by the registry. */
  lastModified?: string;
}

export interface RepositoryTagMap {
  registry: string;
  repository: string;
  tags: RepositoryTag[];
}

export interface AutomationContentApi {
  listRegistries(): Promise<Registry[]>;
  listExecutionEnvironments(opts?: {
    search?: string;
    allTypes?: boolean;
    page?: number;
    perPage?: number;
    sort?: 'repository' | 'registry' | 'sourceType' | 'lastReconciledAt';
    order?: 'asc' | 'desc';
  }): Promise<ExecutionEnvironmentPage>;
  getExecutionEnvironment(ref: string): Promise<ExecutionEnvironment>;
  /** Tag→digest map for one repository, as the index last read it. */
  getRepositoryTags(
    registry: string,
    repository: string,
  ): Promise<RepositoryTagMap>;
  getContents(
    ref: string,
    opts?: { depth?: 'direct' | 'flat'; type?: string },
  ): Promise<ArtifactContents>;
  listCollections(query?: string): Promise<Collection[]>;
  /** Reconcile only the named registry, retaining its previous index on failure. */
  syncRegistry(name: string): Promise<RegistrySyncResult>;
  /** Resolve and inspect only latest in the indexed row's repository. */
  syncArtifact(ref: string): Promise<ArtifactSyncResult>;
}

/** Latest-row reconciliation; successful ref may name a new digest. */
export interface ArtifactSyncResult {
  status: 'completed' | 'failed';
  ref: string;
  tag: 'latest';
  retainedPrevious: boolean;
  lastReconciledAt?: string;
  error?: string;
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
  constructor(
    readonly status: number,
    statusText: string,
  ) {
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

  async syncRegistry(name: string): Promise<RegistrySyncResult> {
    return this.post(`/registries/${encodeURIComponent(name)}/sync`);
  }

  async syncArtifact(ref: string): Promise<ArtifactSyncResult> {
    return this.post(`/artifacts/${encodeURIComponent(ref)}/sync`);
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

  async listExecutionEnvironments(
    opts: {
      search?: string;
      allTypes?: boolean;
      page?: number;
      perPage?: number;
      sort?: 'repository' | 'registry' | 'sourceType' | 'lastReconciledAt';
      order?: 'asc' | 'desc';
    } = {},
  ): Promise<ExecutionEnvironmentPage> {
    // By default only artifacts classified as execution environments are
    // listed. `allTypes` opts in to the full registry inventory: the
    // classification is an exact type match, so unclassified images
    // (legitimate EEs lacking builder labels or a manifest referrer) are
    // hidden by the default filter and only reachable through this option.
    const search = new URLSearchParams();
    if (opts.search) search.set('search', opts.search);
    if (opts.sort) search.set('sort', opts.sort);
    if (opts.order) search.set('order', opts.order);
    if (!opts.allTypes) search.set('type', 'execution-environment');
    if (opts.page !== undefined) search.set('page', String(opts.page));
    if (opts.perPage !== undefined)
      search.set('per_page', String(opts.perPage));
    const suffix = search.toString() ? `?${search}` : '';
    return this.get(`/content${suffix}`);
  }

  async getExecutionEnvironment(ref: string): Promise<ExecutionEnvironment> {
    return this.get(`/content/${encodeURIComponent(ref)}`);
  }

  async getRepositoryTags(
    registry: string,
    repository: string,
  ): Promise<RepositoryTagMap> {
    return this.get(
      `/repositories/${encodeURIComponent(registry)}/${encodeURIComponent(
        repository,
      )}/tags`,
    );
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
}
