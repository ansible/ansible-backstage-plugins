import {
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';

import { ansibleServiceRef } from '@ansible/aap-node';
import { AAPClient } from '../AAPClient/AAPClient';

export { ansibleServiceRef } from '@ansible/aap-node';

/**
 * Transitional factory that wires `AAPClient` to `ansibleServiceRef`.
 *
 * Lives next to `AAPClient` in `backstage-rhaap-common` until `@ansible/aap-backend`
 * owns both the client and this factory (AAP-98937).
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
