import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { OCIRegistryEntityProvider } from './OCIRegistryEntityProvider';
import { readRegistryConfigs } from './config';
import { defaultContentTypes } from './contentTypes';

/**
 * Registers an entity provider per configured OCI registry.
 *
 * Registries are data: adding one is a config change, never a code change. That is the
 * requirement that the content experience work against any OCI-compliant registry,
 * expressed as a wiring decision.
 */
export const catalogModuleAutomationContent = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'automation-content',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, config, logger, scheduler }) {
        const registries = readRegistryConfigs(config);
        if (registries.length === 0) {
          logger.info('automation-content: no OCI registries configured');
          return;
        }

        const contentTypes = defaultContentTypes();

        for (const { connection, schedule, owner, system } of registries) {
          const provider = new OCIRegistryEntityProvider({
            connection,
            contentTypes,
            logger,
            owner,
            system,
            taskRunner: scheduler.createScheduledTaskRunner(schedule),
          });
          catalog.addEntityProvider(provider);
          logger.info(
            `automation-content: registered provider for ${connection.name}`,
          );
        }
      },
    });
  },
});
