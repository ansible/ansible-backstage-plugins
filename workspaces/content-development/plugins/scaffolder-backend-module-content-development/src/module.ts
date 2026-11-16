import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import type { ExtensionPoint } from '@backstage/backend-plugin-api';
import { eeEntityLifecycleServiceRef } from '@ansible/content-development-common';
import type { ScaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import * as scaffolderNode from '@backstage/plugin-scaffolder-node';
import * as scaffolderNodeAlpha from '@backstage/plugin-scaffolder-node/alpha';
import { createCollectionsAutocompleteRouter } from './autocomplete/router';
import {
  createAnsibleContentAction,
  createEEDefinitionAction,
  prepareForPublishAction,
} from './actions';

const scaffolderActionsExtensionPoint = ((
  scaffolderNode as Record<string, unknown>
).scaffolderActionsExtensionPoint ??
  (scaffolderNodeAlpha as Record<string, unknown>)
    .scaffolderActionsExtensionPoint) as ExtensionPoint<ScaffolderActionsExtensionPoint>;
export const scaffolderModuleContentDevelopment = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'content-development',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        eeLifecycle: eeEntityLifecycleServiceRef,
        logger: coreServices.logger,
      },
      init({
        scaffolder,
        config,
        auth,
        discovery,
        httpAuth,
        httpRouter,
        eeLifecycle,
        logger,
      }) {
        return Promise.resolve().then(() => {
          scaffolder.addActions(
            createAnsibleContentAction(config),
            createEEDefinitionAction({
              frontendUrl: config.getString('app.baseUrl'),
              eeLifecycle,
              config,
            }),
            prepareForPublishAction({ rootConfig: config }),
          );
          httpRouter.use(
            createCollectionsAutocompleteRouter({
              auth,
              discovery,
              httpAuth,
              logger,
            }),
          );
        });
      },
    });
  },
});
