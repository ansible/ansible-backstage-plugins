import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { registerGitRepositoryAction } from './actions/registerGitRepository';
import {
  portalOperationsServiceRef,
  portalActiveOrganizationServiceRef,
} from '@ansible/portal-plugin-node';

export default createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'apme',
  register(reg) {
    reg.registerInit({
      deps: {
        actions: scaffolderActionsExtensionPoint,
        auth: coreServices.auth,
        userInfo: coreServices.userInfo,
        permissions: coreServices.permissions,
        operations: portalOperationsServiceRef,
        organizations: portalActiveOrganizationServiceRef,
      },
      // NOSONAR - async required by Backstage module init signature
      async init({
        actions,
        auth,
        userInfo,
        permissions,
        operations,
        organizations,
      }) {
        actions.addActions(
          registerGitRepositoryAction({
            auth,
            userInfo,
            permissions,
            operations,
            organizations,
          }),
        );
      },
    });
  },
});
