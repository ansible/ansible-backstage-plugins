import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { redactorForConnections } from '@ansible/automation-content-common';
import {
  automationContentViewPermission,
  automationContentSyncPermission,
} from '@ansible/automation-content-common/permissions';
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
        permissionsRegistry: coreServices.permissionsRegistry,
      },
      async init({ catalog, config, logger, scheduler, permissionsRegistry }) {
        permissionsRegistry.addPermissions([
          automationContentViewPermission,
          automationContentSyncPermission,
        ]);
        const registries = readRegistryConfigs(config);
        if (registries.length === 0) {
          logger.info('automation-content: no OCI registries configured');
          return;
        }

        const contentTypes = defaultContentTypes();

        // One redactor across every provider: any provider's client can mint
        // a bearer token at runtime, and every provider's logs, errors and
        // entities must recognise it.
        const redactor = redactorForConnections(
          registries.map(registry => registry.connection),
        );

        for (const { connection, schedule, owner, system } of registries) {
          const provider = new OCIRegistryEntityProvider({
            connection,
            contentTypes,
            logger,
            owner,
            system,
            taskRunner: scheduler.createScheduledTaskRunner(schedule),
            redactor,
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
