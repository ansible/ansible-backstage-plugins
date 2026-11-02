import express from 'express';
import Router from 'express-promise-router';
import type {
  HttpAuthService,
  LoggerService,
  PermissionsService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type {
  ActiveOrganizationResolver,
  PortalOperations,
} from '@ansible/portal-plugin-node';

import { ComplianceService } from './service/ComplianceService';
import { ComplianceDatabase } from './database/ComplianceDatabase';
import type { SharedState, RouterDependencies } from './routes/types';

import {
  registerHealthRoutes,
  registerScanRoutes,
  registerFindingsRoutes,
  registerRemediationRoutes,
  registerBaselineRoutes,
  registerDashboardRoutes,
  registerControllerRoutes,
  registerProfileRoutes,
} from './routes';
import { registerInventoryRoutes } from './routes/inventory';
import { registerArtifactRoutes } from './routes/artifacts';

export interface RouterOptions {
  logger: LoggerService;
  service: ComplianceService;
  database: ComplianceDatabase;
  configRetentionDays?: number;
  configIngestTokenTtlMinutes?: number;
  httpAuth?: HttpAuthService;
  permissions?: PermissionsService;
  /**
   * The host's operation registry (`@ansible/portal-plugin-node`). See
   * `routes/types.ts`'s `RouterDependencies.operations` doc comment — like
   * `httpAuth`/`permissions` above, omitted in `development` auth mode.
   */
  operations?: PortalOperations;
  /**
   * Portal identity resolvers (`@ansible/portal-plugin-node`), used by the
   * legacy transport adapters' `resolvePortalContext()` call immediately
   * before each `operations.execute()` (see `routes/types.ts`'s
   * `RouterDependencies.operations` doc comment). Always available from
   * `plugin.ts` regardless of auth mode — unlike `httpAuth`/`permissions`/
   * `operations` above, resolving these has no auth-bypass implications of
   * its own; it's the adapter's `httpAuth`/`permissions`/`operations`
   * presence check that gates whether they're ever reached.
   */
  userInfo?: UserInfoService;
  organizations?: ActiveOrganizationResolver;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const {
    logger,
    service,
    database,
    httpAuth,
    permissions,
    operations,
    userInfo,
    organizations,
    configRetentionDays,
    configIngestTokenTtlMinutes,
  } = options;
  const router = Router();
  router.use((req, res, next) => {
    if (req.path === '/findings/ingest') {
      next();
      return;
    }
    express.json({ limit: '1mb' })(req, res, next);
  });

  const state: SharedState = {
    retentionDays: configRetentionDays ?? 90,
    ingestTokenTtlMinutes: configIngestTokenTtlMinutes ?? 60,
    staleScanThrottle: new Map(),
    parseInProgress: new Set(),
    executionReconcileThrottle: new Map(),
    STALE_CHECK_INTERVAL_MS: 30_000,
  };

  const deps: RouterDependencies = {
    logger,
    service,
    database,
    httpAuth,
    permissions,
    operations,
    state,
    userInfo,
    organizations,
  };

  registerHealthRoutes(router, deps);
  registerScanRoutes(router, deps);
  registerFindingsRoutes(router, deps);
  registerControllerRoutes(router, deps);
  registerRemediationRoutes(router, deps);
  registerBaselineRoutes(router, deps);
  registerDashboardRoutes(router, deps);
  registerProfileRoutes(router, deps);
  registerInventoryRoutes(router, deps);
  registerArtifactRoutes(router, deps);

  return router;
}
