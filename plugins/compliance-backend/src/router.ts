import express from 'express';
import Router from 'express-promise-router';
import type {
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';

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
  httpAuth?: HttpAuthService;
  permissions?: PermissionsService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, service, database, httpAuth, permissions, configRetentionDays } = options;
  const router = Router() as unknown as express.Router;
  router.use((req, res, next) => {
    if (req.path === '/findings/ingest') return next();
    express.json({ limit: '1mb' })(req, res, next);
  });

  const state: SharedState = {
    retentionDays: configRetentionDays ?? 90,
    staleScanThrottle: new Map(),
    parseInProgress: new Set(),
    executionReconcileThrottle: new Map(),
    STALE_CHECK_INTERVAL_MS: 30_000,
  };

  const deps: RouterDependencies = {
    logger, service, database, httpAuth, permissions, state,
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
