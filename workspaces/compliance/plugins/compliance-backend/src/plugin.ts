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
 *   - Development mode: ansible.compliance.authMode = 'development' marks all
 *     routes unauthenticated so the standalone dev shell works without auth.
 */
import * as fs from 'fs';
import {
  coreServices,
  createBackendPlugin,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { compliancePermissions } from '@ansible/compliance-common';

import { ComplianceService } from './service/ComplianceService';
import { ComplianceDatabase } from './database/ComplianceDatabase';
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
        permissionsRegistry: coreServices.permissionsRegistry,
      },
      async init({ logger, config, httpRouter, database, httpAuth, permissions, permissionsRegistry }) {
        logger.info('Initializing compliance backend plugin');

        permissionsRegistry.addPermissions(compliancePermissions);

        // ─── Enabled check (Plugin Factory requirement) ─────────
        const enabled = config.getOptionalBoolean('ansible.compliance.enabled') ?? false;
        if (!enabled) {
          logger.info('Compliance plugin disabled (ansible.compliance.enabled is false or absent)');
          return;
        }

        // ─── Auth mode ──────────────────────────────────────────
        //
        // 'development': all routes unauthenticated — for the standalone
        //   dev shell with guest auth.
        // 'production' (default): only /health is unauthenticated. All
        //   other routes — including /findings/ingest and scan-artifact
        //   registration — require Backstage auth (user session or a
        //   `backend.auth.externalAccess` static token for the AAP
        //   Controller job). Mutating endpoints are additionally gated by
        //   specific compliance permissions via the permissions service in
        //   the router (see `routes/permissions.ts`).
        const authMode = config.getOptionalString('ansible.compliance.authMode') ?? 'production';
        logger.info(`Compliance auth mode: ${authMode}`);

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

        const complianceDb = new ComplianceDatabase(dbClient);

        // ─── Ingest token TTL (ADR-010 hardening) ──────────────
        const ingestTokenTtlMinutes = config.getOptionalNumber('ansible.compliance.ingestTokenTtlMinutes') ?? 60;

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

        logger.info('Compliance service ready');

        // ─── Router ─────────────────────────────────────────────
        //
        // In production mode, pass httpAuth and permissions to the
        // router so it can enforce the compliance permissions (see
        // @ansible/compliance-common's permissions.ts) on mutating
        // endpoints. In development mode, omit them so that the router
        // skips permission checks entirely.
        const router = await createRouter({
          logger,
          service,
          database: complianceDb,
          configRetentionDays: retentionDays,
          configIngestTokenTtlMinutes: ingestTokenTtlMinutes,
          ...(authMode === 'production' ? { httpAuth, permissions } : {}),
        });

        // Express Router (express-promise-router) vs Backstage's `use` param use incompatible Express generics; runtime value is valid.
        // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS.
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
          // Production mode: only /health is unauthenticated.
          //
          // /findings/ingest and scan-artifact registration (POST /scans/*)
          // are called by the AAP Controller job, not an interactive
          // Backstage user. They are NOT marked `allow: 'unauthenticated'`
          // here — by omitting an auth policy entry, they fall through to
          // Backstage's default authenticated policy, which accepts both
          // normal user credentials AND `backend.auth.externalAccess`
          // static-token credentials configured in app-config (see the
          // compliance workspace README). The Controller job authenticates
          // with such a token, stored as an AAP Controller Credential
          // rather than a plaintext extra_var.
          //
          // AuthZ (the `compliance.findings.ingest` permission) and the
          // per-scan ingest token (ADR-010, scoping + TTL + scan-state
          // guard) are enforced inside the route handlers themselves — see
          // `routes/findings.ts` and `routes/artifacts.ts`.
          httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
        }
      },
    });
  },
});
