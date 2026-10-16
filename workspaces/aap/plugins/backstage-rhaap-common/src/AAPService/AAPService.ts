import {
  createServiceFactory,
  createServiceRef,
  coreServices,
} from '@backstage/backend-plugin-api';

import { AAPClient, IAAPService } from '../AAPClient/AAPClient';

/**
 * A reference to the ansible service.
 *
 * @public
 */
export const ansibleServiceRef = createServiceRef<IAAPService>({
  id: 'rhaap.client.service',
  scope: 'plugin',
  defaultFactory: (service: any) =>
    Promise.resolve(
      createServiceFactory({
        service,
        deps: {
          rootConfig: coreServices.rootConfig,
          logger: coreServices.logger,
        },
        /** Create the shared AAP client from backend configuration and logging dependencies. */
        factory({ rootConfig, logger }) {
          logger.info('Creating a new AAP client');
          return new AAPClient({
            rootConfig: rootConfig,
            logger: logger,
          });
        },
      }),
    ),
});
