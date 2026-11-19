import { createServiceRef } from '@backstage/backend-plugin-api';

import type { IAAPService } from './IAAPService';

/**
 * A reference to the ansible service.
 *
 * No `defaultFactory` — `@ansible/aap-backend` supplies the concrete factory
 * for the reusable `AAPClient` in this package. Hosts explicitly install the
 * factory rather than importing the implementation from this reference.
 *
 * @public
 */
export const ansibleServiceRef = createServiceRef<IAAPService>({
  id: 'rhaap.client.service',
  scope: 'plugin',
});
