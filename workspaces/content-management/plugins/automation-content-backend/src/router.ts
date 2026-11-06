import express from 'express';
import Router from 'express-promise-router';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import { ContentStore, IndexedArtifact, IndexedItem } from './ContentStore';
import { registryUrlError } from '@ansible/plugin-catalog-backend-module-automation-content';

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  db: ContentStore;
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

const EE_TYPE = 'execution-environment';

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
    lastReconciledAt: db.reconcileStateFor(artifact.registry)?.at,
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
  const { db, logger } = options;
  const router = Router();
  router.use(express.json({ limit: '5mb' }));

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // -- Registries ---------------------------------------------------------

  router.get('/registries', (_req, res) => {
    res.json({
      items: db.listRegistries().map(state => {
        const reconcile = db.reconcileStateFor(state.connection.name);
        return {
          name: state.connection.name,
          url: state.connection.url,
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
   * Refresh every registry.
   *
   * Backs the manual refresh control in the UI: a full re-read, for when a user knows
   * something changed and does not want to wait for the poll.
   */
  router.post('/sync', async (_req, res) => {
    const started = Date.now();
    const results = [];
    for (const state of db.listRegistries()) {
      const name = state.connection.name;
      const outcome = await db.refreshRegistry(name);
      results.push({ registry: name, ...outcome });
    }
    const ok = results.every(r => r.ok);
    logger.info(`manual sync of ${results.length} registr(ies), ok=${ok}`);
    res.status(ok ? 200 : 207).json({
      status: ok ? 'completed' : 'partial',
      durationMs: Date.now() - started,
      registries: results,
      refreshedAt: db.refreshedAt,
      cache: db.cacheStats,
    });
  });

  /** Cheap drift check: does the registry still match the index? */
  router.post('/registries/:name/poll', async (req, res) => {
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
  });

  /**
   * Full re-read of one registry: the single-registry counterpart of POST /sync,
   * backing the per-registry refresh control in the UI.
   */
  router.post('/registries/:name/sync', async (req, res) => {
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
      `sync ${name}: ${result.discovered} artifacts, ok=${result.ok}${
        result.error ? ` (${result.error})` : ''
      }`,
    );
    res.status(202).json({
      status: result.ok ? 'completed' : 'failed',
      discovered: result.discovered,
      retainedPrevious: !result.ok,
      error: result.error,
      lastReconciledAt: db.reconcileStateFor(name)?.at,
    });
  });

  // -- Content: type-agnostic ---------------------------------------------
  //
  // One endpoint for every content type. Adding skills or node types later must be a
  // matter of registering an adapter, not of hand-writing another route — per-type
  // endpoints are exactly the bespoke engineering this design exists to avoid.

  const listContent = async (req: RouteRequest, res: RouteResponse) => {
    const { type, registry, collection, contentsKnown } = req.query;
    let artifacts = await db.listArtifacts(
      typeof type === 'string' ? type : undefined,
    );

    if (typeof registry === 'string') {
      artifacts = artifacts.filter(a => a.registry === registry);
    }
    if (typeof collection === 'string') {
      artifacts = artifacts.filter(a =>
        (a.manifest?.collections ?? []).some(
          (c: { namespace: string; name: string }) =>
            `${c.namespace}.${c.name}` === collection,
        ),
      );
    }
    if (contentsKnown !== undefined) {
      const want = contentsKnown === 'true';
      artifacts = artifacts.filter(a => a.contentsKnown === want);
    }

    res.json({ items: artifacts.map(a => artifactView(db, a)) });
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

  router.get('/content', listContent);
  router.get('/content/:ref(*)/contents', getContents);
  router.get('/content/:ref(*)', getContent);

  // Aliases retained so existing callers keep working. They are thin filters over the
  // type-agnostic handlers, not parallel implementations.
  router.get('/execution-environments', (req, res) => {
    req.query.type = EE_TYPE;
    listContent(req, res);
  });
  router.get('/execution-environments/:ref(*)/contents', getContents);
  router.get('/execution-environments/:ref(*)', getContent);

  // -- Collections --------------------------------------------------------

  router.get('/collections', async (req, res) => {
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

  router.get('/collections/:namespace/:name', async (req, res) => {
    const fqcn = `${req.params.namespace}.${req.params.name}`;
    const all = await db.listCollections();
    const matches = all.filter(c => c.fqcn === fqcn);
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
  });

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

  router.get('/content-items', searchItems);
  router.get('/content-items/:fqcn', getItem);

  // Aliases: `plugins` is execution-environment vocabulary and does not generalise.
  router.get('/plugins', searchItems);
  router.get('/plugins/:fqcn', getItem);

  // -- Resolution ---------------------------------------------------------

  router.post('/resolve/requirements', async (req, res) => {
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

  router.post('/config/validate', (req, res) => {
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

  // Cast across `@types/express` identity boundaries (see RouteRequest note above).
  return router as unknown as express.Router;
}
