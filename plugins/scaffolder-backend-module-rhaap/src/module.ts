import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  scaffolderActionsExtensionPoint,
  scaffolderAutocompleteExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';

import {
  cleanUp,
  createExecutionEnvironment,
  createJobTemplate,
  createProjectAction,
  createShowCases,
  launchJobTemplate,
} from './actions';

import {
  multiResourceFilter,
  resourceFilter,
  useCaseNameFilter,
} from './filters';
import { handleAutocompleteRequest } from './autocomplete';
import { getAnsibleConfig } from './config-reader';

export const scaffolderModuleRHAAP = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'ansible-aap',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        scaffolderTemplating: scaffolderTemplatingExtensionPoint,
        autocomplete: scaffolderAutocompleteExtensionPoint,
      },
      async init({
        scaffolder,
        config,
        logger,
        scaffolderTemplating,
        autocomplete,
      }) {
        const ansibleConfig = getAnsibleConfig(config);
        scaffolder.addActions(
          createProjectAction(ansibleConfig, logger),
          createExecutionEnvironment(ansibleConfig, logger),
          createJobTemplate(ansibleConfig, logger),
          launchJobTemplate(ansibleConfig, logger),
          cleanUp(ansibleConfig, logger),
          createShowCases(ansibleConfig, logger),
        );
        scaffolderTemplating.addTemplateFilters({
          useCaseNameFilter: useCaseNameFilter,
          resourceFilter: resourceFilter,
          multiResourceFilter: multiResourceFilter,
        });
        autocomplete.addAutocompleteProvider({
          id: 'aap-api-cloud',
          handler: ({
            resource,
            token,
          }: {
            resource: string;
            token: string;
          }): Promise<{ results: any[] }> =>
            handleAutocompleteRequest({ resource, token, config, logger }),
        });
      },
    });
  },
});
