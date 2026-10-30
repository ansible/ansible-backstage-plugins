import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import type { ExtensionPoint } from '@backstage/backend-plugin-api';
import type { ScaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import * as scaffolderNode from '@backstage/plugin-scaffolder-node';
import {
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import * as scaffolderNodeAlpha from '@backstage/plugin-scaffolder-node/alpha';
import { ansibleServiceRef } from '@ansible/backstage-rhaap-common';
import {
  cleanUp,
  createExecutionEnvironment,
  createJobTemplate,
  createProjectAction,
  launchJobTemplate,
} from './actions';
import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
  uuidFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';

const scaffolderActionsExtensionPoint = ((
  scaffolderNode as Record<string, unknown>
).scaffolderActionsExtensionPoint ??
  (scaffolderNodeAlpha as Record<string, unknown>)
    .scaffolderActionsExtensionPoint) as ExtensionPoint<ScaffolderActionsExtensionPoint>;
export const scaffolderModuleAap = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'aap',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scaffolderTemplating: scaffolderTemplatingExtensionPoint,
        autocomplete: scaffolderAutocompleteExtensionPoint,
        ansibleService: ansibleServiceRef,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
      },
      init({
        scaffolder,
        config,
        logger,
        scaffolderTemplating,
        autocomplete,
        ansibleService,
        auth,
        discovery,
      }) {
        return Promise.resolve().then(() => {
          scaffolder.addActions(
            createProjectAction(ansibleService),
            createExecutionEnvironment(ansibleService),
            createJobTemplate(ansibleService),
            launchJobTemplate(ansibleService, config),
            cleanUp(ansibleService),
          );
          scaffolderTemplating.addTemplateFilters({
            useCaseNameFilter,
            resourceFilter,
            multiResourceFilter,
            uuidFilter,
          });
          autocomplete.addAutocompleteProvider({
            id: 'aap-api',
            handler: ({ resource, token, context }) =>
              handleAutocompleteRequest({
                resource,
                token,
                context,
                config,
                logger,
                ansibleService,
                auth,
                discovery,
                includeCollections: false,
              }),
          });
        });
      },
    });
  },
});
