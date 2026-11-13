import express from 'express';
import Router from 'express-promise-router';
import {
  AuditorService,
  HttpAuthService,
  LoggerService,
  PermissionsService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import {
  AuthorizeResult,
  type BasicPermission,
} from '@backstage/plugin-permission-common';
import {
  contentSyncPermission,
  executionEnvironmentsViewPermission,
} from '@ansible/automation-content-common/permissions';
import {
  EE_REPOSITORY_ENTITY_REF_PATTERN,
  EE_REPOSITORY_SOURCE_TYPE,
  EE_REPOSITORY_STATUSES,
  publicUrl,
  type EERepositoryQuery,
} from '@ansible/automation-content-common';
import {
  ContentStore,
  IndexedArtifact,
  IndexedItem,
  RegistryScanIncomplete,
  RegistryWriterBusy,
} from './ContentStore';
import { startRefreshAudit, auditTagChanges, auditResource } from './audit';
import { messages } from './strings/en';
import { STORE_REFRESH_TASK_ID } from './scheduler';
import { registryUrlError } from '@ansible/plugin-catalog-backend-module-automation-content';

export { STORE_REFRESH_TASK_ID } from './scheduler';

export function registryRefreshTaskId(name: string): string {
  return `content-management-store-refresh-${name}`;
}

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  auditor?: AuditorService;
  manualSyncEnabled?: boolean;
  db: ContentStore;
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

function isRepositoryQuery(value: unknown): value is EERepositoryQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const {
    page,
    pageSize,
    query,
    registry,
    sourceType,
    status,
    tag,
    descriptiveTag,
    latestOnly,
    owner,
    sort,
    order,
    favoriteEntityRefs,
    ...unknownFields
  } = value as Record<string, unknown>;
  return (
    Object.keys(unknownFields).length === 0 &&
    (page === undefined ||
      (typeof page === 'number' && Number.isSafeInteger(page) && page >= 1)) &&
    (pageSize === undefined ||
      (typeof pageSize === 'number' &&
        (ALLOWED_PAGE_SIZES as readonly number[]).includes(pageSize))) &&
    (query === undefined ||
      (typeof query === 'string' && query.length <= 256)) &&
    (registry === undefined ||
      (typeof registry === 'string' && registry.length > 0)) &&
    (sourceType === undefined || sourceType === EE_REPOSITORY_SOURCE_TYPE) &&
    (status === undefined ||
      (typeof status === 'string' &&
        (EE_REPOSITORY_STATUSES as readonly string[]).includes(status))) &&
    (tag === undefined ||
      (typeof tag === 'string' && tag.length > 0 && tag.length <= 128)) &&
    (owner === undefined ||
      (typeof owner === 'string' && owner.length > 0 && owner.length <= 256)) &&
    (descriptiveTag === undefined ||
      (typeof descriptiveTag === 'string' &&
        /^[a-z0-9:+#-]{1,63}$/.test(descriptiveTag))) &&
    (latestOnly === undefined || typeof latestOnly === 'boolean') &&
    (sort === undefined ||
      (typeof sort === 'string' &&
        ['repository', 'registry', 'lastSuccessfulReconcileAt'].includes(
          sort,
        ))) &&
    (order === undefined || order === 'asc' || order === 'desc') &&
    (favoriteEntityRefs === undefined ||
      (Array.isArray(favoriteEntityRefs) &&
        favoriteEntityRefs.length <= 1000 &&
        favoriteEntityRefs.every(
          ref =>
            typeof ref === 'string' &&
            EE_REPOSITORY_ENTITY_REF_PATTERN.test(ref),
        )))
  );
}

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
    signing: artifact.signing,
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

function respondToDenial(
  res: RouteResponse,
  decision: 'allow' | 'deny' | 'unavailable',
): boolean {
  if (decision === 'allow') return false;
  if (decision === 'unavailable') {
    res.status(503).json({
      code: 'AUTHORIZATION_UNAVAILABLE',
      error: messages.authorizationUnavailable,
    });
  } else {
    res.status(403).json({ code: 'FORBIDDEN', error: messages.forbidden });
  }
  return true;
}

function reportRefreshError(res: RouteResponse, error: unknown) {
  if (error instanceof RegistryWriterBusy) {
    res.status(409).json({ code: 'REFRESH_BUSY', error: messages.refreshBusy });
  } else {
    res
      .status(500)
      .json({ code: 'REFRESH_FAILED', error: messages.auditFailed });
  }
}

function reportAuditUnconfirmed(res: RouteResponse, retainedPrevious: boolean) {
  res.status(500).json({
    code: 'committed-audit-unconfirmed',
    error: messages.auditUnconfirmed,
    retainedPrevious,
  });
}

function describeValue(value: unknown): string {
  if (value === undefined || value === null) return 'nothing';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? 'nothing';
  } catch {
    return 'an unprintable value';
  }
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const {
    db,
    logger,
    httpAuth,
    permissions,
    scheduler,
    auditor,
    manualSyncEnabled = false,
  } = options;
  const router = Router();

  // Every JSON response passes through the live redactor so runtime bearer
  // tokens and registry-controlled metadata cannot bypass a route handler.
  const redactor = db.redactor;
  router.use((_req: unknown, res: JsonCapableResponse, next: () => void) => {
    const original = res.json.bind(res);
    res.json = (body: unknown) =>
      original(redactor.redactValue(body, { maxDepth: 64 }));
    next();
  });

  async function authorize(
    req: unknown,
    permission: BasicPermission,
    userOnly = false,
  ): Promise<'allow' | 'deny' | 'unavailable'> {
    const credentials = await httpAuth.credentials(
      req as Parameters<HttpAuthService['credentials']>[0],
      { allow: ['user', 'service'] },
    );
    if (userOnly && credentials.principal.type !== 'user') return 'deny';
    try {
      const [decision] = await permissions.authorize([{ permission }], {
        credentials,
      });
      return decision?.result === AuthorizeResult.ALLOW ? 'allow' : 'deny';
    } catch {
      logger.warn(`Unable to authorize ${permission.name}`);
      return 'unavailable';
    }
  }

  async function excludedArtifactType(
    req: unknown,
  ): Promise<string | undefined> {
    return (await authorize(req, executionEnvironmentsViewPermission)) ===
      'allow'
      ? undefined
      : EE_TYPE;
  }

  async function recordRefreshDenial(
    req: unknown,
    permission: BasicPermission,
  ) {
    if (!auditor) return;
    try {
      const credentials = await httpAuth.credentials(
        req as Parameters<HttpAuthService['credentials']>[0],
        { allow: ['user', 'service'] },
      );
      const principal = credentials.principal;
      const event = await startRefreshAudit(auditor, {
        action: 'refresh-denied',
        principal:
          principal.type === 'user'
            ? redactor.redact(principal.userEntityRef)
            : principal.type,
        resource: permission.name,
      });
      await event.fail({
        error: new Error(messages.forbidden),
        meta: { outcome: 'denied' },
      });
    } catch {
      logger.warn(messages.auditUnavailable);
    }
  }

  async function requireContentSync(
    req: unknown,
    res: RouteResponse,
    next: () => void,
  ): Promise<void> {
    const decision = await authorize(req, contentSyncPermission, true);
    if (decision !== 'allow') {
      await recordRefreshDenial(req, contentSyncPermission);
      respondToDenial(res, decision);
      return;
    }
    if (!manualSyncEnabled || !auditor) {
      res.status(503).json({
        code: manualSyncEnabled ? 'AUDIT_UNAVAILABLE' : 'MANUAL_SYNC_DISABLED',
        error: manualSyncEnabled
          ? messages.auditUnavailable
          : messages.manualSyncDisabled,
      });
      return;
    }
    next();
  }

  const parseRepositoryQuery = express.json({ limit: '256kb' });
  router.post(
    '/execution-environment-repositories/query',
    (req, res, next) => {
      parseRepositoryQuery(req, res, (error?: { status?: number }) => {
        if (!error) {
          next();
          return;
        }
        if (error.status === 413) {
          res.status(413).json({
            code: 'QUERY_TOO_LARGE',
            error: messages.repositoryQueryTooLarge,
          });
        } else {
          res.status(400).json({
            code: 'BAD_REQUEST',
            error: messages.invalidRepositoryQuery,
          });
        }
      });
    },
    async (req, res) => {
      if (
        respondToDenial(
          res,
          await authorize(req, executionEnvironmentsViewPermission),
        )
      )
        return;
      if (!isRepositoryQuery(req.body)) {
        res.status(400).json({
          code: 'BAD_REQUEST',
          error: messages.invalidRepositoryQuery,
        });
        return;
      }
      res.json(
        await db.queryEERepositories({
          ...req.body,
          page: req.body.page ?? 1,
          pageSize: req.body.pageSize ?? 10,
        }),
      );
    },
  );

  router.get(
    '/execution-environment-repositories/by-name/:registry/:repository(*)',
    async (req, res) => {
      if (
        respondToDenial(
          res,
          await authorize(req, executionEnvironmentsViewPermission),
        )
      )
        return;
      const { registry, repository } = req.params;
      const details = await db.getEERepository(registry, repository);
      if (!details) {
        res.status(404).json({
          code: 'REPOSITORY_NOT_FOUND',
          error: messages.repositoryNotFound,
        });
        return;
      }
      res.json(details);
    },
  );

  router.use(express.json({ limit: '5mb' }));

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // -- Registries ---------------------------------------------------------

  router.get('/registries', (_req, res) => {
    res.json({
      manualSyncEnabled,
      items: db.listRegistries().map(state => {
        const reconcile = db.reconcileStateFor(state.connection.name);
        return {
          name: state.connection.name,
          url: publicUrl(state.connection.url),
          namespaces: state.connection.namespaces,
          repositories: state.connection.repositories,
          capabilities: state.capabilities,
          lastReconciledAt: reconcile?.at,
          lastSuccessfulReconcileAt: db.lastSuccessfulReconcileAt(
            state.connection.name,
          ),
          lastReconcileOk: reconcile?.ok,
          lastReconcileError:
            reconcile && !reconcile.ok ? RECONCILE_FAILURE_SUMMARY : undefined,
          lastCheckedAt: db.driftStateFor(state.connection.name)?.at,
        };
      }),
    });
  });

  async function beginAudit(
    req: unknown,
    res: RouteResponse,
    action: Parameters<typeof startRefreshAudit>[1]['action'],
    resource: string,
  ) {
    try {
      const credentials = await httpAuth.credentials(
        req as Parameters<HttpAuthService['credentials']>[0],
        { allow: ['user'] },
      );
      if (!auditor || credentials.principal.type !== 'user') {
        throw new Error(messages.auditUnavailable);
      }
      return await startRefreshAudit(auditor, {
        action,
        resource,
        principal: redactor.redact(credentials.principal.userEntityRef),
      });
    } catch {
      res
        .status(503)
        .json({ code: 'AUDIT_UNAVAILABLE', error: messages.auditUnavailable });
      return undefined;
    }
  }

  async function recordFailure(
    event: Awaited<ReturnType<typeof startRefreshAudit>>,
  ) {
    try {
      await event.fail({
        error: new Error(messages.auditFailed),
        meta: { outcome: 'failed' },
      });
    } catch {
      logger.warn(messages.auditUnavailable);
    }
  }

  async function scheduleRefresh(
    res: RouteResponse,
    audit: NonNullable<Awaited<ReturnType<typeof beginAudit>>>,
    taskId: string,
  ): Promise<void> {
    try {
      await scheduler.triggerTask(taskId);
    } catch (error) {
      await recordFailure(audit);
      if (error instanceof Error && error.name === 'ConflictError') {
        res.status(409).json({
          status: 'conflict',
          message: messages.refreshBusy,
          taskId,
        });
      } else {
        res.status(503).json({
          code: 'SCHEDULING_FAILED',
          error: messages.schedulingFailed,
        });
      }
      return;
    }
    const triggeredAt = new Date().toISOString();
    try {
      await audit.success({ meta: { outcome: 'scheduled', triggeredAt } });
    } catch {
      res.status(500).json({
        code: 'scheduled-audit-unconfirmed',
        error: messages.scheduleAuditUnconfirmed,
      });
      return;
    }
    res.status(202).json({
      status: 'scheduled',
      taskId,
      triggeredAt,
    });
  }

  router.post('/sync', requireContentSync, async (req, res) => {
    const audit = await beginAudit(req, res, 'inventory-refresh', 'inventory');
    if (!audit) return;
    await scheduleRefresh(res, audit, STORE_REFRESH_TASK_ID);
  });

  router.post(
    '/registries/:name/poll',
    requireContentSync,
    async (req, res) => {
      const { name } = req.params;
      if (!db.getRegistry(name)) {
        res.status(404).json({
          code: 'REGISTRY_NOT_FOUND',
          error: messages.registryNotFound,
        });
        return;
      }
      const audit = await beginAudit(
        req,
        res,
        'registry-poll',
        auditResource(name),
      );
      if (!audit) return;
      let result;
      try {
        result = await db.pollRegistry(name, false);
      } catch (error) {
        await recordFailure(audit);
        reportRefreshError(res, error);
        return;
      }
      const { changes = [], details, ...summary } = result;
      try {
        await audit.success({
          meta: {
            outcome: result.refreshed ? 'committed' : 'checked',
            changes: auditTagChanges(changes),
          },
        });
      } catch {
        reportAuditUnconfirmed(res, !result.refreshed);
        return;
      }
      res.json({
        ...summary,
        details: details.map(detail =>
          detail.startsWith('check failed:') ? messages.auditFailed : detail,
        ),
        lastReconciledAt: db.reconcileStateFor(name)?.at,
      });
    },
  );

  router.post(
    '/registries/:name/sync',
    requireContentSync,
    async (req, res) => {
      const { name } = req.params;
      if (!db.getRegistry(name)) {
        res.status(404).json({
          code: 'REGISTRY_NOT_FOUND',
          error: messages.registryNotFound,
        });
        return;
      }
      const audit = await beginAudit(
        req,
        res,
        'registry-refresh',
        auditResource(name),
      );
      if (!audit) return;
      if (req.query.wait !== 'true') {
        await scheduleRefresh(res, audit, registryRefreshTaskId(name));
        return;
      }
      let result;
      try {
        result = await db.refreshRegistry(name, false);
      } catch (error) {
        await recordFailure(audit);
        reportRefreshError(res, error);
        return;
      }
      if (!result.ok) {
        await recordFailure(audit);
      } else {
        try {
          await audit.success({
            meta: {
              outcome: 'committed',
              changes: auditTagChanges(result.changes ?? []),
            },
          });
        } catch {
          reportAuditUnconfirmed(res, false);
          return;
        }
      }
      res.status(202).json({
        status: result.ok ? 'completed' : 'failed',
        discovered: result.discovered,
        retainedPrevious: !result.ok,
        error: result.ok ? undefined : messages.auditFailed,
        lastReconciledAt: db.reconcileStateFor(name)?.at,
      });
    },
  );

  router.post(
    '/execution-environment-repositories/sync',
    requireContentSync,
    async (req, res) => {
      const decision = await authorize(
        req,
        executionEnvironmentsViewPermission,
      );
      if (decision !== 'allow') {
        await recordRefreshDenial(req, executionEnvironmentsViewPermission);
        respondToDenial(res, decision);
        return;
      }
      const body = req.body;
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length !== 2 ||
        typeof body.registry !== 'string' ||
        !body.registry ||
        body.registry.length > 256 ||
        typeof body.repository !== 'string' ||
        !body.repository ||
        body.repository.length > 1024
      ) {
        res
          .status(400)
          .json({ code: 'BAD_REQUEST', error: messages.invalidRepository });
        return;
      }
      const { registry, repository } = body as {
        registry: string;
        repository: string;
      };
      const audit = await beginAudit(
        req,
        res,
        'repository-refresh',
        auditResource(registry, repository),
      );
      if (!audit) return;
      let outcome;
      try {
        outcome = await db.refreshEERepository(registry, repository);
      } catch (error) {
        await recordFailure(audit);
        if (error instanceof RegistryScanIncomplete) {
          res.status(502).json({
            code: 'REGISTRY_SCAN_INCOMPLETE',
            error: messages.scanIncomplete,
            retainedPrevious: true,
            lastSuccessfulReconcileAt: db.lastSuccessfulReconcileAt(
              registry,
              repository,
            ),
          });
        } else reportRefreshError(res, error);
        return;
      }
      if (!outcome) {
        await recordFailure(audit);
        res.status(404).json({
          code: 'REPOSITORY_NOT_FOUND',
          error: messages.repositoryNotFound,
        });
        return;
      }
      try {
        await audit.success({
          meta: {
            outcome: 'committed',
            changes: auditTagChanges(outcome.changes),
          },
        });
      } catch {
        reportAuditUnconfirmed(res, false);
        return;
      }
      res.json(outcome.result);
    },
  );

  // -- Content: type-agnostic ---------------------------------------------
  //
  // One endpoint for every content type. Adding skills or node types later must be a
  // matter of registering an adapter, not of hand-writing another route — per-type
  // endpoints are exactly the bespoke engineering this design exists to avoid.

  const listContent = async (
    req: RouteRequest,
    res: RouteResponse,
    eeOnly = false,
  ) => {
    const { registry, collection, contentsKnown } = req.query;
    const requestedType =
      typeof req.query.type === 'string' ? req.query.type : undefined;
    const type = eeOnly ? EE_TYPE : requestedType;
    let excludeType: string | undefined;
    if (type === EE_TYPE) {
      if (
        respondToDenial(
          res,
          await authorize(req, executionEnvironmentsViewPermission),
        )
      )
        return;
    } else if (!type) {
      excludeType = await excludedArtifactType(req);
    }
    const page = Math.max(Math.floor(Number(req.query.page ?? 1)) || 1, 1);
    const rawPerPage = Number(req.query.per_page);
    const pageSize = ALLOWED_PAGE_SIZES.includes(rawPerPage as 10 | 20 | 50)
      ? rawPerPage
      : 10;
    const offset = (page - 1) * pageSize;

    const collectionFilter =
      typeof collection === 'string' ? collection : undefined;

    let items: ReturnType<typeof artifactView>[];
    let totalItems: number;

    if (collectionFilter) {
      let artifacts = await db.listArtifacts(type, excludeType);

      if (typeof registry === 'string')
        artifacts = artifacts.filter(a => a.registry === registry);
      if (contentsKnown !== undefined) {
        const want = contentsKnown === 'true';
        artifacts = artifacts.filter(a => a.contentsKnown === want);
      }
      artifacts = artifacts.filter(a =>
        (a.manifest?.collections ?? []).some(
          (c: { namespace: string; name: string }) =>
            `${c.namespace}.${c.name}` === collectionFilter,
        ),
      );

      totalItems = artifacts.length;
      items = artifacts
        .slice(offset, offset + pageSize)
        .map(a => artifactView(db, a));
    } else {
      const result = await db.listArtifactsPaginated({
        type,
        excludeType,
        registry: typeof registry === 'string' ? registry : undefined,
        contentsKnown:
          contentsKnown !== undefined ? contentsKnown === 'true' : undefined,
        limit: pageSize,
        offset,
      });

      totalItems = result.totalCount;
      items = result.items.map(a => artifactView(db, a));
    }

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

  async function readArtifact(
    req: RouteRequest,
    res: RouteResponse,
    eeOnly: boolean,
  ): Promise<IndexedArtifact | undefined> {
    if (
      eeOnly &&
      respondToDenial(
        res,
        await authorize(req, executionEnvironmentsViewPermission),
      )
    ) {
      return undefined;
    }
    const artifact = await db.getArtifact(req.params.ref);
    if (
      !artifact ||
      (eeOnly && artifact.type !== EE_TYPE) ||
      (!eeOnly &&
        artifact.type === EE_TYPE &&
        (await excludedArtifactType(req)))
    ) {
      res
        .status(404)
        .json({ error: 'Content not found', code: 'CONTENT_NOT_FOUND' });
      return undefined;
    }
    return artifact;
  }

  /**
   * Contents of one artifact.
   *
   * `depth=direct` returns the artifacts it contains — for an execution environment,
   * its collections. `depth=flat` returns the content items themselves. Both are
   * useful: the first is how a user browses, the second is how an agent searches.
   */
  const getContents = async (
    req: RouteRequest,
    res: RouteResponse,
    eeOnly = false,
  ) => {
    const artifact = await readArtifact(req, res, eeOnly);
    if (!artifact) return;

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

  const getContent = async (
    req: RouteRequest,
    res: RouteResponse,
    eeOnly = false,
  ) => {
    const artifact = await readArtifact(req, res, eeOnly);
    if (!artifact) return;
    res.json(artifactView(db, artifact));
  };

  router.get('/content', (req, res) => listContent(req, res));
  router.get('/content/:ref(*)/contents', (req, res) => getContents(req, res));
  router.get('/content/:ref(*)', (req, res) => getContent(req, res));

  router.get('/execution-environments', (req, res) =>
    listContent(req, res, true),
  );
  router.get('/execution-environments/:ref(*)/contents', (req, res) =>
    getContents(req, res, true),
  );
  router.get('/execution-environments/:ref(*)', (req, res) =>
    getContent(req, res, true),
  );

  // -- Collections --------------------------------------------------------

  router.get('/collections', async (req, res) => {
    const q =
      typeof req.query.q === 'string' ? req.query.q.toLowerCase() : undefined;
    const all = await db.listCollections(await excludedArtifactType(req));
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
    const all = await db.listCollections(await excludedArtifactType(req));
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

    const allItems = await db.listItems(await excludedArtifactType(req));
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

    const excludeType = await excludedArtifactType(req);
    const variants = await db.findItems(fqcn, scope, excludeType);
    if (variants.length === 0) {
      res.status(404).json({
        error: scope
          ? `${fqcn} not found in ${scope}`
          : `Not found in any known content: ${fqcn}`,
        code: 'ITEM_NOT_FOUND',
      });
      return;
    }

    const providedBy = (
      scope ? await db.findItems(fqcn, undefined, excludeType) : variants
    ).map(variant => variant.artifactRef);

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
    if (
      respondToDenial(
        res,
        await authorize(req, executionEnvironmentsViewPermission),
      )
    )
      return;
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

    const collections = environments.flatMap(
      environment => environment.manifest?.collections ?? [],
    );
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
          .filter(c => `${c.namespace}.${c.name}` === requirement.name)
          .map(c => c.version);
        const versions = [...new Set(anyVersion)];
        return {
          name: requirement.name,
          version: requirement.version,
          reason: versions.length
            ? `Available versions: ${versions.join(', ')}`
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
    res.json({ satisfiedBy, unsatisfied, notes });
  });

  // -- Configuration as code ----------------------------------------------

  /**
   * Render an arbitrary request value for an error message without ever
   * throwing on it. The whole point of this endpoint is to judge malformed
   * documents, so the error paths must survive whatever a caller sends —
   * an object whose `toString` is null would otherwise crash the handler.
   */
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
