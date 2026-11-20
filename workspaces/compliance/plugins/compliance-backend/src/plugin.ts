/**
 * Backend plugin registration for the compliance plugin.
 *
 * Registers:
 *   - Database migrations (Knex)
 *   - ComplianceService (backed by the AAP Controller API)
 *   - REST router at /api/compliance/*
 *
 * Auth model:
 *   - Backstage layer: httpAuth + permissions service gate every mutating
 *     endpoint behind a specific compliance permission (see
 *     `@ansible/compliance-common`'s `permissions.ts`), checked via
 *     `requirePermission()`. Read-only endpoints are open to all
 *     authenticated users.
 *   - Ingest layer: `/findings/ingest` and the scan-artifact registration
 *     route are called by an AAP Controller job rather than an interactive
 *     user. They authenticate via a Backstage `backend.auth.externalAccess`
 *     static token (AuthN), are gated by the `compliance.findings.ingest`
 *     permission (AuthZ), and are further scoped by a per-scan ingest
 *     token with a TTL and scan-state guard (ADR-010). See the compliance
 *     workspace README for the full design.
 *   - AAP layer: per-user AAP OAuth2 tokens are passed through to
 *     Controller API calls via x-aap-token header. AAP RBAC decides
 *     what inventories/JTs/credentials the user can access.
 *   - Local dev: guest (or other) auth still produces a Backstage session;
 *     user-facing routes are never unauthenticated.
 */
import * as fs from 'fs';
import {
  coreServices,
  createBackendPlugin,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { compliancePermissions } from '@ansible/compliance-common';
import {
  createPortalPlugin,
  portalHealthServiceRef,
  portalActiveOrganizationServiceRef,
  portalOperationsServiceRef,
} from '@ansible/portal-plugin-node';

import { ComplianceService } from './service/ComplianceService';
import { ComplianceDatabase } from './database/ComplianceDatabase';
import { createRouter } from './router';
import { registerComplianceOperations } from './operations';

export const complianceBackendPlugin = createBackendPlugin({
  pluginId: 'compliance',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        database: coreServices.database,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        health: portalHealthServiceRef,
        organizations: portalActiveOrganizationServiceRef,
        operations: portalOperationsServiceRef,
      },
      async init({
        logger,
        config,
        httpRouter,
        database,
        httpAuth,
        userInfo,
        permissions,
        permissionsRegistry,
        health,
        organizations,
        operations,
      }) {
        logger.info('Initializing compliance backend plugin');

        // Portal backend SDK instance (`@ansible/portal-plugin-node`).
        // `health` ties into the cross-plugin `PortalHealthStatus`
        // aggregator. (Audit emission now happens inside
        // `PortalOperations.execute()` itself — see the Operations section
        // below — so this plugin no longer needs `createMiddleware()`.)
        const portalPlugin = createPortalPlugin({
          pluginId: 'compliance',
          health,
        });

        permissionsRegistry.addPermissions(compliancePermissions);

        // ─── Enabled check (Plugin Factory requirement) ─────────
        const enabled =
          config.getOptionalBoolean('ansible.compliance.enabled') ?? false;
        if (!enabled) {
          logger.info(
            'Compliance plugin disabled (ansible.compliance.enabled is false or absent)',
          );
          portalPlugin.pushHealthStatus({
            state: 'UNKNOWN',
            message:
              'Compliance is disabled in config (ansible.compliance.enabled: false).',
          });
          return;
        }

        // ─── Database ───────────────────────────────────────────
        const dbClient = await database.getClient();

        // Run migrations — check source TS migrations first (local dev:
        // src/database/migrations/), then fall back to the package-root JS
        // mirror (dist-dynamic: migrations/). resolvePackagePath() resolves
        // relative to this package's own package.json rather than
        // `__dirname`, which doesn't reliably point at the same directory
        // once this plugin is bundled for production/dynamic-plugin use.
        const tsMigrations = resolvePackagePath(
          '@ansible/plugin-compliance-backend',
          'src',
          'database',
          'migrations',
        );
        const jsMigrations = resolvePackagePath(
          '@ansible/plugin-compliance-backend',
          'migrations',
        );
        const migrationsDir = fs.existsSync(tsMigrations)
          ? tsMigrations
          : jsMigrations;

        // SQLite ALTER TABLE recreates tables, which fails FK checks inside transactions.
        // Disable FK checks before migrations, re-enable after.
        await dbClient.raw('PRAGMA foreign_keys = OFF').catch(() => {});
        await dbClient.migrate.latest({
          directory: migrationsDir,
          tableName: 'compliance_knex_migrations',
          disableTransactions: true,
        });
        await dbClient.raw('PRAGMA foreign_keys = ON').catch(() => {});
        logger.info('Compliance database migrations applied');

        const complianceDb = new ComplianceDatabase(dbClient);

        // ─── Ingest token TTL (ADR-010 hardening) ──────────────
        const ingestTokenTtlMinutes =
          config.getOptionalNumber(
            'ansible.compliance.ingestTokenTtlMinutes',
          ) ?? 60;

        // ─── Data retention cleanup ────────────────────────────
        const retentionDays =
          config.getOptionalNumber('ansible.compliance.retentionDays') ?? 90;
        try {
          const cleanedUp =
            await complianceDb.cleanupOldFindings(retentionDays);
          if (cleanedUp > 0) {
            logger.info(
              `Data retention: cleaned up ${cleanedUp} findings older than ${retentionDays} days`,
            );
          }
        } catch (cleanupError) {
          logger.warn(
            `Data retention cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        }

        // ─── Service ────────────────────────────────────────────
        const service = new ComplianceService(config, logger);
        service.setDatabase(complianceDb);

        logger.info('Compliance service ready');

        // ─── Operations ─────────────────────────────────────────
        //
        // Registers handlers in the host `PortalOperations` registry (same
        // pattern as `permissionsRegistry.addPermissions()` above).
        registerComplianceOperations({
          operations,
          service,
          database: complianceDb,
          logger,
        });

        // ─── Router ─────────────────────────────────────────────
        const router = await createRouter({
          logger,
          service,
          database: complianceDb,
          configRetentionDays: retentionDays,
          configIngestTokenTtlMinutes: ingestTokenTtlMinutes,
          httpAuth,
          permissions,
          operations,
          userInfo,
          organizations,
        });

        // Express Router (express-promise-router) vs Backstage's `use` param use incompatible Express generics; runtime value is valid.
        // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS.
        httpRouter.use(router);

        portalPlugin.pushHealthStatus({
          state: 'READY',
          message: 'Compliance backend initialized. Routes registered.',
        });

        // ─── Auth Policies ───────────────────────────────────────
        //
        // Only /health is unauthenticated. `/findings/ingest` and
        // scan-artifact registration (POST under `/scans`) are called by
        // the Controller job using `backend.auth.externalAccess` static
        // token credentials — see the compliance workspace README.
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
