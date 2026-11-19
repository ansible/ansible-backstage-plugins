import {
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';

import { ansibleServiceRef, AAPClient } from '@ansible/aap-node';

export { ansibleServiceRef } from '@ansible/aap-node';

/**
 * Transitional factory that wires `AAPClient` to `ansibleServiceRef`.
 *
 * Keeps the legacy factory API independent of the installable backend package.
 *
 * @deprecated Explicitly install `@ansible/aap-backend` instead. Do not register
 * both factories for the same service.
 *
 * @public
 */
export const ansibleServiceFactory = createServiceFactory({
  service: ansibleServiceRef,
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
});
