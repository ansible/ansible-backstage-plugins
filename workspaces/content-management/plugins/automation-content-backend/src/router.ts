import { groupImages } from './groupImages';
import express from 'express';
import Router from 'express-promise-router';
import { ConfigReader } from '@backstage/config';
import { publicUrl } from '@ansible/automation-content-common';
import {
  ContentStore,
  IndexedArtifact,
  IndexedItem,
  ArtifactSyncNotFoundError,
} from './ContentStore';
import {
  HttpAuthService,
  LoggerService,
  PermissionsService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  automationContentViewPermission,
  automationContentSyncPermission,
} from '@ansible/automation-content-common/permissions';
import { registryUrlError } from '@ansible/plugin-catalog-backend-module-automation-content';

export const STORE_REFRESH_TASK_ID = 'content-management-store-refresh';

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  db: ContentStore;
  permissions: PermissionsService;
  scheduler: SchedulerService;
}

/**
 * Structural request/response shapes for route handlers.
 *
 * The monorepo hosts several `@types/express` majors (backend plugins on express 4,
 * portal-plugin-node and newer modules on express 5); annotating handlers with a
 * named express type ties them to one identity and clashes with the router's.
 * Structural types sidestep that — same pattern and rationale as
 * `workspaces/apme/plugins/catalog-backend-module-apme/src/router.ts`.
 */
type RouteRequest = {
  params: Record<string, string>;
  query: Record<string, unknown>;
};

type RouteResponse = {
  status: (code: number) => RouteResponse;
  json: (body: unknown) => unknown;
};

/** Structural response shape for the shared API redaction boundary. */
type JsonCapableResponse = {
  json: (body: unknown) => unknown;
};

const EE_TYPE = 'execution-environment';

const ALLOWED_PAGE_SIZES = [10, 20, 50] as const;

/**
 * What GET /registries reports about a failed reconciliation.
 *
 * A reconcile error's detail can quote internal hostnames — a TLS rejection
 * names the certificate's subject alternative names, for instance. Every
 * route except GET /health requires sign-in (#977), and /health answers a
 * bare status only; the registry listing stays conservative with this fixed
 * summary, while the raw cause goes to the backend log and the sync
 * responses, where the caller explicitly asked for a refresh.
 */
export const RECONCILE_FAILURE_SUMMARY =
  'reconciliation failed — see backend logs, or an authenticated sync, for the cause';

/**
 * Coerce a documentation field to an array.
 *
 * `ansible-doc` returns `description`, `author` and `notes` as either a scalar or a
 * list, depending purely on how each collection author wrote the YAML — in this
 * environment 33 items use a string for `description` and 121 for `author`. The API
 * contract says array, so it is normalised once here rather than every consumer
 * guessing. A consumer that assumes the declared type should not be punished for it.
 */
function asArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/** Normalise the documentation fields whose shape varies across collections. */
function normaliseDoc(
  detail: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...detail };
  for (const field of ['description', 'author', 'notes', 'requirements']) {
    if (field in out) {
      const coerced = asArray(out[field]);
      if (coerced === undefined) delete out[field];
      else out[field] = coerced;
    }
  }
  return out;
}

/** Summary view — deliberately small, so list responses stay cheap. */
function itemSummary(item: IndexedItem) {
  return {
    fqcn: item.fqcn,
    name: item.name,
    type: item.type,
    collection: item.collection,
    collectionVersion: item.collectionVersion,
    shortDescription: item.shortDescription,
    versionAdded: item.versionAdded,
    ...(item.deprecated ? { deprecated: true } : {}),
    in: item.artifactRef,
  };
}

function enumerationOf(artifact: IndexedArtifact) {
  const manifest = artifact.manifest;
  return manifest
    ? {
        status: manifest.complete ? 'complete' : 'partial',
        source: 'build-time-manifest',
        ansibleCore: manifest.generatedBy.ansibleCore,
        extractedAt: manifest.generatedAt,
      }
    : { status: 'unknown', source: 'external-introspection' };
}

function artifactView(db: ContentStore, artifact: IndexedArtifact) {
  return {
    ref: artifact.ref,
    type: artifact.type,
    registry: artifact.registry,
    repository: artifact.repository,
    digest: artifact.digest,
    tags: artifact.tags,
    pullReference: artifact.pullReference,
    contentsKnown: artifact.contentsKnown,
    classification: artifact.classification,
    enumeration: enumerationOf(artifact),
    // Most recent full or row-specific attempt; syncing one artifact must not
    // advance freshness for other rows in the same registry.
    lastReconciledAt: db.reconcileStateOf(artifact)?.at,
    lastReconcileOk: db.reconcileStateOf(artifact)?.ok,
    signing: artifact.signing,
    counts: db.countsFor(artifact),
    collections: (artifact.manifest?.collections ?? []).map(c => ({
      namespace: c.namespace,
      name: c.name,
      version: c.version,
      fqcn: `${c.namespace}.${c.name}`,
    })),
  };
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { db, logger, httpAuth, permissions, scheduler } = options;
  const router = Router();
  router.use(express.json({ limit: '5mb' }));

  // Every JSON response passes through the live redactor so runtime bearer
  // tokens and registry-controlled metadata cannot bypass a route handler.
  const redactor = db.redactor;
  router.use((_req: unknown, res: JsonCapableResponse, next: () => void) => {
    const original = res.json.bind(res);
    res.json = (body: unknown) =>
      original(redactor.redactValue(body, { maxDepth: 64 }));
    next();
  });

  // Reads are permission-gated; sync operations remain superuser-only.
  const requireContentView = async (
    req: unknown,
    res: RouteResponse,
    next: () => void,
  ): Promise<void> => {
    try {
      const credentials = await httpAuth.credentials(
        req as Parameters<HttpAuthService['credentials']>[0],
      );
      const [decision] = await permissions.authorize(
        [{ permission: automationContentViewPermission }],
        { credentials },
      );
      if (decision?.result === AuthorizeResult.ALLOW) {
        next();
        return;
      }
    } catch {
      // Permission service failures fail closed without leaking details,
      // mirroring requireContentSync.
      logger.warn('Unable to authorize content view');
    }
    res
      .status(403)
      .json({ error: 'Forbidden: ansible.content.view permission required' });
  };

  /**
   * Manual sync requires a signed-in user and explicit permission, not a
   * catalog User entity or AAP superuser annotation. Never trust UI gating.
   * Typed structurally (req: unknown) for the same @types/express identity
   * reasons as RouteRequest above; cast only at the httpAuth boundary, the
   * same pattern as workspaces/apme .../router.ts `ensureUser`.
   */
  const requireContentSync = async (
    req: unknown,
    res: RouteResponse,
    next: () => void,
  ) => {
    const credentials = await httpAuth.credentials(
      req as Parameters<HttpAuthService['credentials']>[0],
      { allow: ['user'] },
    );
    try {
      const [decision] = await permissions.authorize(
        [{ permission: automationContentSyncPermission }],
        { credentials },
      );
      if (decision?.result === AuthorizeResult.ALLOW) {
        next();
        return;
      }
    } catch {
      // Permission service failures fail closed without leaking details.
      logger.warn('Unable to authorize content registry sync');
    }
    res
      .status(403)
      .json({ error: 'Forbidden: ansible.content.sync permission required' });
  };

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.post('/artifacts/:ref/sync', requireContentSync, async (req, res) => {
    try {
      res.status(202).json(await db.syncArtifact(req.params.ref));
    } catch (error) {
      if (!(error instanceof ArtifactSyncNotFoundError)) throw error;
      res.status(404).json({ error: error.message, code: error.code });
    }
  });

  // Reads are permission-gated below, each route explicitly, so the OpenAPI
  // contract stays a truthful list of real paths (a catch-all GET would show
  // up in the spec as a bogus wildcard entry).

  // -- Registries ---------------------------------------------------------

  router.get('/registries', requireContentView, (_req, res) => {
    res.json({
      items: db.listRegistries().map(state => {
        const reconcile = db.reconcileStateFor(state.connection.name);
        return {
          name: state.connection.name,
          url: publicUrl(state.connection.url),
          namespaces: state.connection.namespaces,
          repositories: state.connection.repositories,
          capabilities: state.capabilities,
          lastReconciledAt: reconcile?.at,
          lastReconcileOk: reconcile?.ok,
          lastReconcileError:
            reconcile && !reconcile.ok ? RECONCILE_FAILURE_SUMMARY : undefined,
          lastCheckedAt: db.driftStateFor(state.connection.name)?.at,
        };
      }),
    });
  });

  /**
   * Tag→digest map for one repository, flattened across its indexed digests.
   *
   * Backs the tag selector on the image details page: selecting a tag is
   * navigating to the artifact of the digest that tag last resolved to.
   */
  router.get(
    '/repositories/:registry/:repository(*)/tags',
    requireContentView,
    async (req, res) => {
      const { registry, repository } = req.params;
      if (!db.getRegistry(registry)) {
        res.status(404).json({
          error: `No such registry: ${registry}`,
          code: 'REGISTRY_NOT_FOUND',
        });
        return;
      }
      res.json({
        registry,
        repository,
        tags: await db.repositoryTags(registry, repository),
      });
    },
  );

  /**
   * Queue a background refresh of every registry.
   */
  router.post('/sync', requireContentSync, async (_req, res) => {
    try {
      await scheduler.cancelTask(STORE_REFRESH_TASK_ID);
    } catch {
      // Task was not running — nothing to cancel
    }

    try {
      await scheduler.triggerTask(STORE_REFRESH_TASK_ID);
    } catch {
      res.status(409).json({
        status: 'conflict',
        message: 'A refresh is already in progress.',
        taskId: STORE_REFRESH_TASK_ID,
      });
      return;
    }

    logger.info('manual sync triggered');
    res.status(202).json({
      status: 'scheduled',
      taskId: STORE_REFRESH_TASK_ID,
      triggeredAt: new Date().toISOString(),
    });
  });

  /** Cheap drift check: does the registry still match the index? */
  router.post(
    '/registries/:name/poll',
    requireContentSync,
    async (req, res) => {
      const { name } = req.params;
      if (!db.getRegistry(name)) {
        res.status(404).json({
          error: `No such registry: ${name}`,
          code: 'REGISTRY_NOT_FOUND',
        });
        return;
      }
      const result = await db.pollRegistry(name);
      res.json({
        ...result,
        lastReconciledAt: db.reconcileStateFor(name)?.at,
      });
    },
  );

  /**
   * Full re-read of one registry: the single-registry counterpart of POST /sync,
   * backing the per-registry refresh control in the UI.
   */
  router.post(
    '/registries/:name/sync',
    requireContentSync,
    async (req, res) => {
      const { name } = req.params;
      if (!db.getRegistry(name)) {
        res.status(404).json({
          error: `No such registry: ${name}`,
          code: 'REGISTRY_NOT_FOUND',
        });
        return;
      }
      const result = await db.refreshRegistry(name);
      logger.info(
        redactor.redact(
          `sync ${name}: ${result.discovered} artifacts, ok=${result.ok}`,
        ),
      );
      res.status(202).json({
        status: result.ok ? 'completed' : 'failed',
        discovered: result.discovered,
        retainedPrevious: !result.ok,
        error: result.error,
        lastReconciledAt: db.reconcileStateFor(name)?.at,
      });
    },
  );

  // -- Content: type-agnostic ---------------------------------------------
  //
  // One endpoint for every content type. Adding skills or node types later must be a
  // matter of registering an adapter, not of hand-writing another route — per-type
  // endpoints are exactly the bespoke engineering this design exists to avoid.

  const SORT_KEYS = [
    'repository',
    'registry',
    'sourceType',
    'lastReconciledAt',
  ] as const;

  const listContent = async (req: RouteRequest, res: RouteResponse) => {
    const { type, registry, collection, contentsKnown, sort, order, search } =
      req.query;
    if (typeof search === 'string' && search.length > 256) {
      res.status(400).json({
        error: 'Search must not exceed 256 characters',
        code: 'INVALID_SEARCH',
      });
      return;
    }
    if (
      sort !== undefined &&
      (typeof sort !== 'string' || !SORT_KEYS.includes(sort as never))
    ) {
      res.status(400).json({ error: 'Invalid sort key', code: 'INVALID_SORT' });
      return;
    }
    if (order !== undefined && order !== 'asc' && order !== 'desc') {
      res
        .status(400)
        .json({ error: 'Invalid sort order', code: 'INVALID_ORDER' });
      return;
    }
    const page = Math.max(Math.floor(Number(req.query.page ?? 1)) || 1, 1);
    const rawPerPage = Number(req.query.per_page);
    const pageSize = ALLOWED_PAGE_SIZES.includes(rawPerPage as 10 | 20 | 50)
      ? rawPerPage
      : 10;
    const offset = (page - 1) * pageSize;

    const collectionFilter =
      typeof collection === 'string' ? collection : undefined;
    const filters = {
      search: typeof search === 'string' ? search : undefined,
      registry: typeof registry === 'string' ? registry : undefined,
      contentsKnown:
        contentsKnown !== undefined ? contentsKnown === 'true' : undefined,
    };

    let items: ReturnType<typeof artifactView>[];
    let totalItems: number;

    // Match digests first, then select from the complete repository group.
    const matches = await db.listArtifactSummaries(
      typeof type === 'string' ? type : undefined,
      { ...filters, collection: collectionFilter },
    );
    const allArtifacts = await db.listArtifactSummaries(undefined, {
      repositories: [
        ...new Map(
          matches.map(({ registry: source, repository }) => [
            JSON.stringify([source, repository]),
            { registry: source, repository },
          ]),
        ).values(),
      ],
    });
    const artifacts = groupImages(
      allArtifacts,
      matches,
      typeof type === 'string' ? type : undefined,
    );

    if (typeof sort === 'string') {
      const key = sort as (typeof SORT_KEYS)[number];
      const direction = order === 'desc' ? -1 : 1;
      const value = (a: IndexedArtifact): string | undefined => {
        if (key === 'lastReconciledAt') return db.reconcileStateOf(a)?.at;
        if (key === 'sourceType') {
          // Match today's badge. When producer association lands, definitionEntityRef
          // must take priority (definition-file), even when a registry is present.
          return a.registry ? 'external-registry' : 'definition-file';
        }
        return a[key] || undefined;
      };
      // Compute each key once rather than per comparison: the timestamp key is a
      // registry-state lookup, and a comparator that re-derives it makes sorting
      // O(n log n) lookups out of O(n).
      const keyed = artifacts.map(artifact => ({
        artifact,
        key: value(artifact),
      }));
      // Missing timestamps and empty/absent registries sort last ascending, first
      // descending. Lexical ISO timestamp ordering; equal keys retain index order.
      keyed.sort((a, b) => {
        const left = a.key;
        const right = b.key;
        let comparison = 0;
        if (left !== right) {
          if (left === undefined) comparison = 1;
          else if (right === undefined) comparison = -1;
          else comparison = left < right ? -1 : 1;
        }
        return direction * comparison;
      });
      const sorted = keyed.map(k => k.artifact);
      totalItems = sorted.length;
      items = sorted
        .slice(offset, offset + pageSize)
        .map(a => artifactView(db, a));
    } else {
      artifacts.sort((a, b) => a.ref.localeCompare(b.ref));
      totalItems = artifacts.length;
      items = artifacts
        .slice(offset, offset + pageSize)
        .map(a => artifactView(db, a));
    }

    // Only the selected page needs full rows (including potentially large manifests).
    items = await Promise.all(
      items.map(async item => {
        const full = await db.getArtifact(item.ref);
        return full ? artifactView(db, { ...full, tags: item.tags }) : item;
      }),
    );

    const lastPage = Math.max(Math.ceil(totalItems / pageSize), 1);

    const baseParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'page' && typeof value === 'string') {
        baseParams.set(key, value);
      }
    }
    const pageLink = (p: number) => {
      const params = new URLSearchParams(baseParams);
      params.set('page', String(p));
      return `?${params.toString()}`;
    };

    res.json({
      page,
      pageSize,
      totalItems,
      next: page < lastPage ? pageLink(page + 1) : null,
      previous: page > 1 ? pageLink(page - 1) : null,
      firstPage: pageLink(1),
      lastPage: pageLink(lastPage),
      items,
    });
  };

  /**
   * Contents of one artifact.
   *
   * `depth=direct` returns the artifacts it contains — for an execution environment,
   * its collections. `depth=flat` returns the content items themselves. Both are
   * useful: the first is how a user browses, the second is how an agent searches.
   */
  const getContents = async (req: RouteRequest, res: RouteResponse) => {
    const artifact = await db.getArtifact(req.params.ref);
    if (!artifact) {
      res
        .status(404)
        .json({ error: 'Content not found', code: 'CONTENT_NOT_FOUND' });
      return;
    }

    const enumeration = enumerationOf(artifact);

    if (!artifact.manifest) {
      res.json({
        enumeration,
        classification: artifact.classification,
        collections: [],
        items: [],
      });
      return;
    }

    const depth = req.query.depth === 'flat' ? 'flat' : 'direct';
    const typeFilter =
      typeof req.query.type === 'string' ? req.query.type : undefined;

    const collections = artifact.manifest.collections.map(c => ({
      // These entries are derived from the manifest's collection inventory.
      type: 'collection',
      namespace: c.namespace,
      name: c.name,
      version: c.version,
      fqcn: `${c.namespace}.${c.name}`,
      counts: {
        plugins: c.plugins.length,
        roles: c.roles.length,
        playbooks: c.playbooks.length,
        edaPlugins: c.edaPlugins.length,
        rulebooks: c.rulebooks.length,
      },
    }));

    const items =
      depth === 'flat' || typeFilter
        ? (await db.itemsIn(artifact.ref))
            .filter(i => !typeFilter || i.type === typeFilter)
            .map(itemSummary)
        : [];

    res.json({
      enumeration,
      classification: artifact.classification,
      collections,
      items,
    });
  };

  const getContent = async (req: RouteRequest, res: RouteResponse) => {
    const artifact = await db.getArtifact(req.params.ref);
    if (!artifact) {
      res
        .status(404)
        .json({ error: 'Content not found', code: 'CONTENT_NOT_FOUND' });
      return;
    }
    res.json(artifactView(db, artifact));
  };

  router.get('/content', requireContentView, listContent);
  router.get('/content/:ref(*)/contents', requireContentView, getContents);
  router.get('/content/:ref(*)', requireContentView, getContent);

  // Aliases retained so existing callers keep working. They are thin filters over the
  // type-agnostic handlers, not parallel implementations.
  router.get('/execution-environments', requireContentView, (req, res) => {
    req.query.type = EE_TYPE;
    listContent(req, res);
  });
  router.get(
    '/execution-environments/:ref(*)/contents',
    requireContentView,
    getContents,
  );
  router.get('/execution-environments/:ref(*)', requireContentView, getContent);

  // -- Collections --------------------------------------------------------

  router.get('/collections', requireContentView, async (req, res) => {
    const q =
      typeof req.query.q === 'string' ? req.query.q.toLowerCase() : undefined;
    const all = await db.listCollections();
    const items = all
      .filter(
        c =>
          !q ||
          c.fqcn.toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q),
      )
      .map(c => ({
        namespace: c.namespace,
        name: c.name,
        fqcn: c.fqcn,
        version: c.version,
        description: c.description,
        repository: c.repository,
        counts: {
          plugins: c.plugins.length,
          roles: c.roles.length,
          playbooks: c.playbooks.length,
          edaPlugins: c.edaPlugins.length,
          rulebooks: c.rulebooks.length,
        },
        providedBy: c.providedBy,
      }));
    res.json({ items });
  });

  router.get(
    '/collections/:namespace/:name',
    requireContentView,
    async (req, res) => {
      const fqcn = `${req.params.namespace}.${req.params.name}`;
      const matches = (await db.listCollections()).filter(c => c.fqcn === fqcn);
      if (matches.length === 0) {
        res.status(404).json({
          error: `Collection not found: ${fqcn}`,
          code: 'COLLECTION_NOT_FOUND',
        });
        return;
      }
      const collection = matches[0];
      res.json({
        namespace: collection.namespace,
        name: collection.name,
        fqcn,
        version: collection.version,
        description: collection.description,
        repository: collection.repository,
        counts: {
          plugins: collection.plugins.length,
          roles: collection.roles.length,
          playbooks: collection.playbooks.length,
          edaPlugins: collection.edaPlugins.length,
          rulebooks: collection.rulebooks.length,
        },
        versions: matches.map(m => ({
          version: m.version,
          providedBy: m.providedBy,
        })),
        providedBy: collection.providedBy,
      });
    },
  );

  // -- Content items (Level B) --------------------------------------------

  const searchItems = async (req: RouteRequest, res: RouteResponse) => {
    const { q, type, collection } = req.query;
    const scope =
      (typeof req.query.in === 'string' && req.query.in) ||
      (typeof req.query.executionEnvironment === 'string' &&
        req.query.executionEnvironment) ||
      undefined;
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 500);
    const needle = typeof q === 'string' ? q.toLowerCase() : undefined;

    const allItems = await db.listItems();
    const matched = allItems.filter(item => {
      if (type && item.type !== type) return false;
      if (collection && item.collection !== collection) return false;
      if (scope && item.artifactRef !== scope) return false;
      if (!needle) return true;
      return (
        item.fqcn.toLowerCase().includes(needle) ||
        (item.shortDescription ?? '').toLowerCase().includes(needle)
      );
    });

    res.json({
      totalItems: matched.length,
      items: matched.slice(0, limit).map(itemSummary),
    });
  };

  const getItem = async (req: RouteRequest, res: RouteResponse) => {
    const fqcn = req.params.fqcn;
    const scope =
      (typeof req.query.in === 'string' && req.query.in) ||
      (typeof req.query.executionEnvironment === 'string' &&
        req.query.executionEnvironment) ||
      undefined;

    const variants = await db.findItems(fqcn, scope);
    if (variants.length === 0) {
      res.status(404).json({
        error: scope
          ? `${fqcn} not found in ${scope}`
          : `Not found in any known content: ${fqcn}`,
        code: 'ITEM_NOT_FOUND',
      });
      return;
    }

    const providedBy = (await db.findItems(fqcn)).map(v => v.artifactRef);

    const render = async (item: IndexedItem) => {
      const artifact = await db.getArtifact(item.artifactRef);
      return {
        ...itemSummary(item),
        ...normaliseDoc(item.detail ?? {}),
        in: item.artifactRef,
        providedBy,
        enumeration: artifact
          ? enumerationOf(artifact)
          : { status: 'unknown', source: 'external-introspection' },
      };
    };

    if (variants.length === 1) {
      res.json(await render(variants[0]));
      return;
    }

    res.json({
      fqcn,
      variantCount: variants.length,
      variants: await Promise.all(variants.map(render)),
    });
  };

  router.get('/content-items', requireContentView, searchItems);
  router.get('/content-items/:fqcn', requireContentView, getItem);

  // Aliases: `plugins` is execution-environment vocabulary and does not generalise.
  router.get('/plugins', requireContentView, searchItems);
  router.get('/plugins/:fqcn', requireContentView, getItem);

  // -- Resolution ---------------------------------------------------------

  router.post('/resolve/requirements', requireContentView, async (req, res) => {
    // Validate at the boundary: a malformed body must read as a 400, not a 500
    // from a `.map` on a non-array or an entry with no name.
    const raw = req.body?.collections;
    if (!Array.isArray(raw)) {
      res
        .status(400)
        .json({ error: 'collections must be an array', code: 'BAD_REQUEST' });
      return;
    }
    for (const entry of raw) {
      const ok =
        typeof entry === 'string'
          ? entry.length > 0
          : typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { name?: unknown }).name === 'string' &&
            (entry as { name: string }).name.length > 0 &&
            ((entry as { version?: unknown }).version === undefined ||
              typeof (entry as { version?: unknown }).version === 'string');
      if (!ok) {
        res.status(400).json({
          error:
            'each collection must be a non-empty string or { name: string, version?: string }',
          code: 'BAD_REQUEST',
        });
        return;
      }
    }
    const required = (
      raw as Array<string | { name: string; version?: string }>
    ).map(entry =>
      typeof entry === 'string'
        ? { name: entry, version: '*' }
        : { version: '*', ...entry },
    );

    const environments = await db.listArtifacts(EE_TYPE);
    const satisfiedBy: Array<{
      ref: string;
      pullReference: string;
      matched: Array<{
        namespace: string;
        name: string;
        version: string;
        fqcn: string;
      }>;
    }> = [];

    for (const environment of environments) {
      if (!environment.manifest) continue;
      const available = environment.manifest.collections;
      const matched = [];
      let satisfiesAll = true;

      for (const requirement of required) {
        const found = available.find(
          c =>
            `${c.namespace}.${c.name}` === requirement.name &&
            (requirement.version === '*' || c.version === requirement.version),
        );
        if (!found) {
          satisfiesAll = false;
          break;
        }
        matched.push({
          namespace: found.namespace,
          name: found.name,
          version: found.version,
          fqcn: `${found.namespace}.${found.name}`,
        });
      }

      if (satisfiesAll && required.length > 0) {
        satisfiedBy.push({
          ref: environment.ref,
          pullReference: environment.pullReference,
          matched,
        });
      }
    }

    const collections = await db.listCollections();
    const unsatisfied = required
      .filter(
        requirement =>
          !environments.some(e =>
            (e.manifest?.collections ?? []).some(
              c =>
                `${c.namespace}.${c.name}` === requirement.name &&
                (requirement.version === '*' ||
                  c.version === requirement.version),
            ),
          ),
      )
      .map(requirement => {
        const anyVersion = collections
          .filter(c => c.fqcn === requirement.name)
          .map(c => c.version);
        return {
          name: requirement.name,
          version: requirement.version,
          reason: anyVersion.length
            ? `Available versions: ${anyVersion.join(', ')}`
            : 'Not present in any known execution environment',
        };
      });

    const notes: string[] = [];
    const unknown = environments.filter(e => !e.contentsKnown).length;
    if (unknown > 0) {
      notes.push(
        `${unknown} execution environment(s) have undetermined contents and were not ` +
          `considered; they may also satisfy these requirements.`,
      );
    }
    const allArtifacts = await db.listArtifacts();
    const unclassified = allArtifacts.filter(a => a.type !== EE_TYPE).length;
    if (unclassified > 0) {
      notes.push(
        `${unclassified} image(s) were not recognised as execution environments and ` +
          `were excluded.`,
      );
    }

    res.json({ satisfiedBy, unsatisfied, notes });
  });

  // -- Configuration as code ----------------------------------------------

  /**
   * Render an arbitrary request value for an error message without ever
   * throwing on it. The whole point of this endpoint is to judge malformed
   * documents, so the error paths must survive whatever a caller sends —
   * an object whose `toString` is null would otherwise crash the handler.
   */
  function describeValue(value: unknown): string {
    if (value === undefined || value === null) return 'nothing';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value) ?? 'nothing';
    } catch {
      return 'an unprintable value';
    }
  }

  router.post('/config/validate', requireContentView, (req, res) => {
    const errors: Array<{ path: string; message: string }> = [];
    const warnings: Array<{ path: string; message: string }> = [];
    const body = req.body ?? {};

    if (body.apiVersion !== 'content.ansible.com/v1') {
      errors.push({
        path: 'apiVersion',
        message: `Expected content.ansible.com/v1, got ${describeValue(
          body.apiVersion,
        )}`,
      });
    }
    if (body.kind !== 'ContentConfiguration') {
      errors.push({
        path: 'kind',
        message: `Expected ContentConfiguration, got ${describeValue(
          body.kind,
        )}`,
      });
    }
    if (!Array.isArray(body.registries)) {
      errors.push({ path: 'registries', message: 'Must be an array' });
    } else {
      const seen = new Set<string>();
      body.registries.forEach((entry: unknown, i: number) => {
        const at = `registries[${i}]`;
        // Each entry in `registries` should be a settings object like
        // `{ name: ..., url: ... }`. If it is anything else — a bare
        // string, a number, null — that is a mistake in the document being
        // checked, and telling the user what is wrong is this endpoint's
        // entire job. It must never crash on the input it exists to judge.
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push({ path: at, message: 'Must be an object' });
          return;
        }
        const registry = entry as Record<string, unknown>;
        if (!registry.name)
          errors.push({ path: `${at}.name`, message: 'Required' });

        if (typeof registry.name === 'string') {
          if (seen.has(registry.name)) {
            errors.push({
              path: `${at}.name`,
              message: `Duplicate registry name: ${registry.name}`,
            });
          }
          seen.add(registry.name);
        }

        // The URL must be text. A number or a nested object here is a
        // mistake in the document, not a server error: report it and keep
        // checking the rest of the entry.
        if (typeof registry.url !== 'string' || registry.url === '') {
          errors.push({
            path: `${at}.url`,
            message: 'Required and must be a string',
          });
        } else {
          // The same registry-URL rule the loader enforces at startup: a
          // registry URL this endpoint approves can never prevent the
          // backend from starting. The guarantee covers registry URLs
          // only; other fields get advisory warnings here and can still
          // fail loading with a type error.
          const reason = registryUrlError(registry.url);
          if (reason) {
            errors.push({ path: `${at}.url`, message: `Invalid: ${reason}` });
          }
        }

        const hasRepos =
          Array.isArray(registry.repositories) &&
          registry.repositories.length > 0;
        const hasNamespaces =
          Array.isArray(registry.namespaces) && registry.namespaces.length > 0;
        if (!hasRepos && !hasNamespaces) {
          warnings.push({
            path: at,
            message:
              'Neither repositories nor namespaces set. Discovery will find nothing ' +
              'unless the registry supports catalog enumeration.',
          });
        }
        let insecure: boolean | undefined;
        try {
          // Use the same coercion as readRegistryConfigs at startup, including
          // Backstage's truthy/false-like strings and numeric 1/0.
          const config = new ConfigReader(
            registry as ConstructorParameters<typeof ConfigReader>[0],
          );
          insecure = config.getOptionalBoolean('insecure');
        } catch {
          errors.push({
            path: `${at}.insecure`,
            message:
              'Must be a boolean or a Backstage-recognized boolean value',
          });
        }
        if (insecure === true) {
          warnings.push({
            path: `${at}.insecure`,
            message:
              'Plain HTTP allowed and TLS certificate verification disabled — ' +
              'local development only',
          });
          // The same refusal readRegistryConfigs makes at startup: a bundle
          // to verify against and an opt-out of verification contradict
          // each other, and CI should see it before the process does.
          if (registry.caFile) {
            errors.push({
              path: `${at}.caFile`,
              message:
                'caFile cannot be combined with insecure: verify against ' +
                'the bundle or opt out of verification, not both',
            });
          }
        }
        if (registry.rewriteAuthRealmHost === true) {
          warnings.push({
            path: `${at}.rewriteAuthRealmHost`,
            message:
              'Credentials will be sent to the configured host rather than the realm ' +
              'the registry advertises. Intended for registries advertising an ' +
              'unreachable token endpoint.',
          });
        }
      });
    }

    res.json({ valid: errors.length === 0, errors, warnings });
  });

  // Platform error middleware formats whatever escapes a handler. Ensure the
  // original is cleaned, or replace it with a safe copy when it is read-only.
  router.use(
    (
      err: Error,
      _req: unknown,
      _res: unknown,
      next: (err?: unknown) => void,
    ) => {
      next(redactor.redactErrorForRethrow(err));
    },
  );

  // Cast across `@types/express` identity boundaries (see RouteRequest note above).
  return router as unknown as express.Router;
}
