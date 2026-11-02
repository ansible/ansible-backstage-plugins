import {
  createBackendModule,
  coreServices,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';

import {
  ansibleServiceRef,
  userProvisionerRef,
  IUserProvisionerConnectable,
} from '@ansible/backstage-rhaap-common';
import { UserProvisionerProvider } from './UserProvisionerProvider';

export const catalogModuleRhaapUserProvisioner = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'rhaap-user-provisioner',
  /** Declare catalog and user-provisioning services required by the AAP sign-in adapter. */
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        ansibleService: ansibleServiceRef,
        userProvisioner: userProvisionerRef,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      /** Connect AAP user provisioning to the catalog provider and backend extension point. */
      init({ catalog, ansibleService, userProvisioner, config, logger }) {
        return Promise.resolve().then(() => {
          const provider = new UserProvisionerProvider({
            ansibleService,
            config,
            logger,
          });

          // Cast to IUserProvisionerConnectable to access the wiring method.
          // This interface is separate from IUserProvisioner (the public consumer API)
          // so registerCreateUserFn doesn't leak into the auth plugin's surface.
          (
            userProvisioner as unknown as IUserProvisionerConnectable
          ).registerCreateUserFn((username, userID) =>
            provider.createUser(username, userID),
          );

          catalog.addEntityProvider(provider);
        });
      },
    });
  },
});
