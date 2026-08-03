/**
 * Backend plugin registration for the compliance plugin.
 *
 * Registers:
 *   - Database migrations (Knex)
 *   - ComplianceService (mock/live toggle)
 *   - REST router at /api/compliance/*
 *
 * Auth model (Option A+C):
 *   - Backstage layer: httpAuth + permissions service gate mutating
 *     endpoints behind catalogEntityCreatePermission (admin tier).
 *     Read-only endpoints are open to all authenticated users.
 *   - AAP layer: per-user AAP OAuth2 tokens are passed through to
 *     Controller API calls via x-aap-token header. AAP RBAC decides
 *     what inventories/JTs/credentials the user can access.
 *   - Development mode: ansible.compliance.authMode = 'development' marks all
 *     routes unauthenticated so ./bin/start.sh mock works without auth.
 */
import * as path from 'path';
import * as fs from 'fs';
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';

import { ComplianceService } from './service/ComplianceService';
import { ComplianceDatabase } from './database/ComplianceDatabase';
import { MockDataSeeder } from './service/MockDataSeeder';
import { createRouter } from './router';

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
        permissions: coreServices.permissions,
      },
      async init({ logger, config, httpRouter, database, httpAuth, permissions }) {
        logger.info('Initializing compliance backend plugin');

        // ─── Enabled check (Plugin Factory requirement) ─────────
        const enabled = config.getOptionalBoolean('ansible.compliance.enabled') ?? false;
        if (!enabled) {
          logger.info('Compliance plugin disabled (ansible.compliance.enabled is false or absent)');
          return;
        }

        // ─── Auth mode ──────────────────────────────────────────
        //
        // 'development' (default): all routes unauthenticated — for
        //   standalone dev shell with guest auth (./bin/start.sh mock).
        // 'production': only /health is unauthenticated. All other
        //   routes require Backstage auth. Mutating endpoints are
        //   additionally gated by catalogEntityCreatePermission via
        //   the permissions service in the router.
        const authMode = config.getOptionalString('ansible.compliance.authMode') ?? 'production';
        logger.info(`Compliance auth mode: ${authMode}`);

        // ─── Database ───────────────────────────────────────────
        const dbClient = await database.getClient();

        // Run migrations — check compiled TS migrations first (local dev: src/database/migrations/),
        // then fall back to package-root JS migrations (dist-dynamic: ../migrations/).
        const tsMigrations = path.resolve(__dirname, 'database', 'migrations');
        const jsMigrations = path.resolve(__dirname, '..', 'migrations');
        const migrationsDir = fs.existsSync(tsMigrations) ? tsMigrations : jsMigrations;

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

        const complianceDb = new ComplianceDatabase(dbClient as any);

        // ─── Data retention cleanup ────────────────────────────
        const retentionDays = config.getOptionalNumber('ansible.compliance.retentionDays') ?? 90;
        try {
          const cleanedUp = await complianceDb.cleanupOldFindings(retentionDays);
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

        if (service.getDataSource() === 'mock') {
          try {
            await new MockDataSeeder(dbClient as any, logger).seed();
          } catch (seedErr) {
            logger.error(`Mock data seeder failed: ${seedErr instanceof Error ? seedErr.message : String(seedErr)}`);
          }
        }

        logger.info(
          `Compliance service ready (dataSource=${service.getDataSource()})`,
        );

        // ─── Router ─────────────────────────────────────────────
        //
        // In production mode, pass httpAuth and permissions to the
        // router so it can enforce catalogEntityCreatePermission on
        // mutating endpoints. In development mode, omit them so that
        // the router skips permission checks entirely.
        const router = await createRouter({
          logger,
          service,
          database: complianceDb,
          configRetentionDays: retentionDays,
          ...(authMode === 'production' ? { httpAuth, permissions } : {}),
        });

        httpRouter.use(router);

        // ─── Auth Policies ───────────────────────────────────────

        if (authMode === 'development') {
          // Development mode: all routes unauthenticated for guest-auth.
          // This is the standalone dev shell path (./bin/start.sh mock).

          // --- Read-only endpoints ---
          httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/profiles', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/scans', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/findings', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/compliance-profiles', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/inventories', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/dashboard', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/posture', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/workflow-templates', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/workflow-status', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/workflow-nodes', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/job-events', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/job-status', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/controller', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/previous-findings', allow: 'unauthenticated' });

          // --- Mutating endpoints ---
          httpRouter.addAuthPolicy({ path: '/scan', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/remediate', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/remediation-profiles', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/remediation-profiles/:id', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/remediation-executions', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/remediation-executions/:id', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/baseline-targets', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/baseline-targets/:id', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/remediation-error-details', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/settings', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/cleanup', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/findings/ingest', allow: 'unauthenticated' });
        } else {
          // Production mode: only /health and /findings/ingest are unauthenticated.
          // /findings/ingest must be reachable from the EE (playbook POSTs findings
          // directly after normalization). The playbook cannot authenticate as a
          // Backstage user, so this endpoint is unauthenticated at the Backstage
          // layer. Security is enforced via per-scan ingest tokens stored in the
          // database (ADR-010): each scan generates a unique token at creation time,
          // and the ingest endpoint rejects requests without a valid matching token.
          httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
          httpRouter.addAuthPolicy({ path: '/findings/ingest', allow: 'unauthenticated' });
          // Artifact registration (POST) from playbook uses per-scan ingest token
          // (ADR-010, ADR-032). The /scans prefix must be unauthenticated for this POST.
          // GET artifact endpoints enforce Backstage httpAuth in the route handler (ADR-037).
          httpRouter.addAuthPolicy({ path: '/scans', allow: 'unauthenticated' });
        }
      },
    });
  },
});
