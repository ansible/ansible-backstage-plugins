import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import type { ExtensionPoint } from '@backstage/backend-plugin-api';
import { eeEntityLifecycleServiceRef } from '@ansible/backstage-rhaap-common';
import type { ScaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import * as scaffolderNode from '@backstage/plugin-scaffolder-node';
import * as scaffolderNodeAlpha from '@backstage/plugin-scaffolder-node/alpha';
import {
  createAnsibleContentAction,
  createEEDefinitionAction,
  prepareForPublishAction,
} from './actions';
import { handleCollectionsAutocompleteRequest } from './autocomplete';

const scaffolderActionsExtensionPoint = ((
  scaffolderNode as Record<string, unknown>
).scaffolderActionsExtensionPoint ??
  (scaffolderNodeAlpha as Record<string, unknown>)
    .scaffolderActionsExtensionPoint) as ExtensionPoint<ScaffolderActionsExtensionPoint>;
const scaffolderAutocompleteExtensionPoint = ((
  scaffolderNode as Record<string, unknown>
).scaffolderAutocompleteExtensionPoint ??
  (scaffolderNodeAlpha as Record<string, unknown>)
    .scaffolderAutocompleteExtensionPoint) as ExtensionPoint<any>;
export const scaffolderModulePortalScaffolder = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'portal-scaffolder',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
        eeLifecycle: eeEntityLifecycleServiceRef,
        logger: coreServices.logger,
        autocomplete: scaffolderAutocompleteExtensionPoint,
      },
      init({
        scaffolder,
        config,
        auth,
        discovery,
        eeLifecycle,
        logger,
        autocomplete,
      }) {
        return Promise.resolve().then(() => {
          scaffolder.addActions(
            createAnsibleContentAction(config),
            createEEDefinitionAction({
              frontendUrl: config.getString('app.baseUrl'),
              auth,
              discovery,
              eeLifecycle,
              config,
            }),
            prepareForPublishAction({ rootConfig: config }),
          );
          autocomplete.addAutocompleteProvider({
            id: 'portal-catalog',
            handler: ({ context }: { context?: Record<string, string> }) =>
              handleCollectionsAutocompleteRequest({
                auth,
                discovery,
                logger,
                context,
              }),
          });
        });
      },
    });
  },
});
