import {
  coreServices,
  createBackendPlugin,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { metricsServiceRef } from '@backstage/backend-plugin-api/alpha';
import {
  defaultContentTypes,
  readRegistryConfigs,
} from '@ansible/plugin-catalog-backend-module-automation-content';
import {
  contentSyncPermission,
  executionEnvironmentsViewPermission,
} from '@ansible/automation-content-common/permissions';
import { ContentStore, type TagChange } from './ContentStore';
import { auditResource, auditTagChanges, startRefreshAudit } from './audit';
import { createRouter, registryRefreshTaskId } from './router';
import { registerAll } from './taskRegistration';
import {
  createContentScheduler,
  DRIFT_POLL_TASK_ID,
  STORE_REFRESH_TASK_ID,
} from './scheduler';

const migrationsDir = resolvePackagePath(
  '@ansible/plugin-automation-content-backend',
  'migrations',
);

/**
 * The automation content API.
 *
 * Serves content discovery, documentation and requirements resolution over the same
 * universal model the catalog provider uses, so the Portal UI, the MCP endpoint and an
 * agent all read one schema rather than each deriving their own.
 */
export const automationContentPlugin = createBackendPlugin({
  pluginId: 'automation-content',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        database: coreServices.database,
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        auditor: coreServices.auditor,
        rootLifecycle: coreServices.rootLifecycle,
        pluginMetadata: coreServices.pluginMetadata,
        metrics: metricsServiceRef,
      },
      async init({
        config,
        database,
        logger,
        httpRouter,
        httpAuth,
        permissions,
        permissionsRegistry,
        auditor,
        rootLifecycle,
        pluginMetadata,
        metrics,
      }) {
        const knex = await database.getClient();

        if (!database.migrations?.skip) {
          await knex.migrate.latest({
            directory: migrationsDir,
          });
        }
        const registries = readRegistryConfigs(config);

        const loggerAdapter = {
          info: (m: string) => logger.info(m),
          warn: (m: string) => logger.warn(m),
          debug: (m: string) => logger.debug(m),
        };
        const store = new ContentStore(
          registries.map(({ connection }) => connection),
          knex as any,
          loggerAdapter,
          defaultContentTypes(),
          new Map(
            registries.map(({ connection, owner }) => [connection.name, owner]),
          ),
          new Map(
            registries.map(({ connection, repositoryTags }) => [
              connection.name,
              repositoryTags,
            ]),
          ),
        );

        const scheduler = createContentScheduler({
          database,
          logger,
          httpRouter,
          rootLifecycle,
          pluginMetadata,
          metrics,
        });
        const manualSyncEnabled =
          config.getOptionalBoolean('automationContent.manualSync.enabled') ??
          false;

        permissionsRegistry.addPermissions([
          executionEnvironmentsViewPermission,
          contentSyncPermission,
        ]);
        httpRouter.use(
          await createRouter({
            db: store,
            logger,
            httpAuth,
            permissions,
            scheduler,
            auditor,
            manualSyncEnabled,
          }),
        );

        // Every route requires a signed-in user or service token except the
        // liveness probe (#977). GET /health answers a bare status only (#958).
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });

        async function auditScheduledOutcome(
          action: 'scheduled-refresh' | 'scheduled-poll',
          registry: string,
          outcome: 'committed' | 'retained' | 'checked',
          changes: readonly TagChange[],
        ): Promise<void> {
          try {
            const event = await startRefreshAudit(auditor, {
              action,
              principal: 'service:automation-content/scheduler',
              resource: auditResource(registry),
            });
            await event.success({
              meta: { outcome, changes: auditTagChanges(changes) },
            });
          } catch {
            logger.warn(
              'Scheduled reconciliation audit could not be confirmed',
            );
          }
        }

        // Cheap drift check between full refreshes. Lists tags and HEADs each one —
        // no bodies, no blobs — and only triggers a real refresh when the
        // tag-to-digest map actually differs. Without this, a push into the registry
        // is invisible for up to a full refresh interval.
        await scheduler.scheduleTask({
          id: DRIFT_POLL_TASK_ID,
          frequency: { hours: 2 },
          timeout: { minutes: 5 },
          initialDelay: { seconds: 45 },
          fn: async () => {
            const { checked, refreshed, requests } = await store.pollAll(
              (name, result) => {
                const incompleteOrUnchanged = result.changed
                  ? 'retained'
                  : 'checked';
                return auditScheduledOutcome(
                  'scheduled-poll',
                  name,
                  result.refreshed ? 'committed' : incompleteOrUnchanged,
                  result.changes ?? [],
                );
              },
            );
            if (refreshed > 0) {
              logger.info(
                `drift poll: ${refreshed}/${checked} registr(ies) refreshed ` +
                  `(${requests} cheap requests)`,
              );
            } else {
              logger.debug(
                `drift poll: no changes (${requests} cheap requests)`,
              );
            }
          },
        });

        await scheduler.scheduleTask({
          id: STORE_REFRESH_TASK_ID,
          frequency: { hours: 24 },
          timeout: { minutes: 10 },
          initialDelay: { seconds: 30 },
          fn: async () => {
            const { artifacts, items } = await store.refreshAll(
              (name, result) =>
                auditScheduledOutcome(
                  'scheduled-refresh',
                  name,
                  result.ok ? 'committed' : 'retained',
                  result.changes ?? [],
                ),
            );
            logger.info(
              `content store refreshed: ${artifacts} artifacts, ${items} content items`,
            );
          },
        });

        // Every registry gets its refresh task registered; one failure does
        // not stop the rest, and the whole batch fails loudly together.
        await registerAll(
          registries.map(({ connection, schedule }) => async () => {
            await scheduler.scheduleTask({
              id: registryRefreshTaskId(connection.name),
              frequency: schedule.frequency,
              timeout: schedule.timeout,
              initialDelay: schedule.initialDelay ?? { seconds: 30 },
              fn: async () => {
                const result = await store.refreshRegistry(connection.name);
                await auditScheduledOutcome(
                  'scheduled-refresh',
                  connection.name,
                  result.ok ? 'committed' : 'retained',
                  result.changes ?? [],
                );
                logger.info(
                  `registry '${connection.name}' refreshed: ${result.discovered} artifacts, ok=${result.ok}`,
                );
              },
            });
          }),
        );
      },
    });
  },
});
