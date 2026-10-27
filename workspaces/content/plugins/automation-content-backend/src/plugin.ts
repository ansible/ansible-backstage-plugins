import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { readRegistryConfigs } from '@ansible/plugin-catalog-backend-module-automation-content';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import { ContentIndex } from './ContentIndex';
import { createRouter } from './router';

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
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        scheduler: coreServices.scheduler,
      },
      async init({ config, logger, httpRouter, httpAuth, scheduler }) {
        const registries = readRegistryConfigs(config).map(r => r.connection);

        const index = new ContentIndex(
          registries,
          {
            info: (m: string) => logger.info(m),
            warn: (m: string) => logger.warn(m),
            debug: (m: string) => logger.debug(m),
          },
          // Same registry as the catalog provider uses, so the API and the catalog can
          // never disagree about what an artifact is.
          defaultContentTypes(),
        );

        httpRouter.use(await createRouter({ index, logger, httpAuth }));
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
            const { checked, refreshed, requests } = await index.pollAll();
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
          id: 'automation-content-index-refresh',
          frequency: { minutes: 30 },
          timeout: { minutes: 10 },
          initialDelay: { seconds: 3 },
          fn: async () => {
            const { artifacts, items } = await index.refreshAll();
            const environments = index.listArtifacts(
              'execution-environment',
            ).length;
            logger.info(
              `content index refreshed: ${artifacts} artifacts ` +
                `(${environments} execution environments), ${items} content items`,
            );
          },
        });
      },
    });
  },
});
