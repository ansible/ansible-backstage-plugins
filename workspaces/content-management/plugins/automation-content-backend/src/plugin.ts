import {
  coreServices,
  createBackendPlugin,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { readRegistryConfigs } from '@ansible/plugin-catalog-backend-module-automation-content';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import { ContentStore } from './ContentStore';
import { createRouter } from './router';
import { CatalogClient } from '@backstage/catalog-client';

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
        scheduler: coreServices.scheduler,
        auth: coreServices.auth,
        userInfo: coreServices.userInfo,
        discovery: coreServices.discovery,
      },
      async init({
        config,
        database,
        logger,
        httpRouter,
        httpAuth,
        permissions,
        scheduler,
        auth,
        userInfo,
        discovery,
      }) {
        const knex = await database.getClient();

        if (!database.migrations?.skip) {
          await knex.migrate.latest({
            directory: migrationsDir,
          });
        }
        const registries = readRegistryConfigs(config).map(r => r.connection);

        const loggerAdapter = {
          info: (m: string) => logger.info(m),
          warn: (m: string) => logger.warn(m),
          debug: (m: string) => logger.debug(m),
        };
        const store = new ContentStore(
          registries,
          knex as any,
          loggerAdapter,
          defaultContentTypes(),
        );

        httpRouter.use(
          await createRouter({
            db: store,
            logger,
            httpAuth,
            permissions,
            auth,
            userInfo,
            catalogClient: new CatalogClient({ discoveryApi: discovery }),
          }),
        );

        // Every route requires a signed-in user or service token except the
        // liveness probe (#977). GET /health answers a bare status only (#958).
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });

        // Cheap drift check between full refreshes. Lists tags and HEADs each one —
        // no bodies, no blobs — and only triggers a real refresh when the
        // tag-to-digest map actually differs. Without this, a push into the registry
        // is invisible for up to a full refresh interval.
        await scheduler.scheduleTask({
          id: 'automation-content-drift-poll',
          frequency: { seconds: 120 },
          timeout: { minutes: 5 },
          initialDelay: { seconds: 45 },
          fn: async () => {
            const { checked, refreshed, requests } = await store.pollAll();
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
          id: 'automation-content-store-refresh',
          frequency: { minutes: 30 },
          timeout: { minutes: 10 },
          initialDelay: { seconds: 3 },
          fn: async () => {
            const { artifacts, items } = await store.refreshAll();
            logger.info(
              `content store refreshed: ${artifacts} artifacts, ${items} content items`,
            );
          },
        });
      },
    });
  },
});
