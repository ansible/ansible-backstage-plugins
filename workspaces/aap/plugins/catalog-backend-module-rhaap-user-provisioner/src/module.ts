import {
  createBackendModule,
  coreServices,
} from '@backstage/backend-plugin-api';
import * as catalogNode from '@backstage/plugin-catalog-node';
import { catalogProcessingExtensionPoint as alphaCatalogProcessing } from '@backstage/plugin-catalog-node/alpha';

import {
  ansibleServiceRef,
  userProvisionerRef,
  IUserProvisionerConnectable,
} from '@ansible/backstage-rhaap-common';
import { UserProvisionerProvider } from './UserProvisionerProvider';

// Backstage 1.48 promoted this contract; support both deployment baselines.
const catalogProcessingExtensionPoint: typeof alphaCatalogProcessing =
  Reflect.get(catalogNode, 'catalogProcessingExtensionPoint') ??
  alphaCatalogProcessing;

export const catalogModuleRhaapUserProvisioner = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'rhaap-user-provisioner',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        ansibleService: ansibleServiceRef,
        userProvisioner: userProvisionerRef,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ catalog, ansibleService, userProvisioner, config, logger }) {
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
      },
    });
  },
});
