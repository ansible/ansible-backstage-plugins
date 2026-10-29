import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import type { ExtensionPoint } from '@backstage/backend-plugin-api';
import type { ScaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import * as scaffolderNode from '@backstage/plugin-scaffolder-node';
import * as scaffolderNodeAlpha from '@backstage/plugin-scaffolder-node/alpha';
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
      },
      init({ scaffolder, config, auth, discovery }) {
        return Promise.resolve().then(() => {
          scaffolder.addActions(
            createAnsibleContentAction(config),
            createEEDefinitionAction({
              frontendUrl: config.getString('app.baseUrl'),
              auth,
              discovery,
              config,
            }),
            prepareForPublishAction({ rootConfig: config }),
          );
        });
      },
    });
  },
});
