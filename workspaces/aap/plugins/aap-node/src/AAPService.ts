import { createServiceRef } from '@backstage/backend-plugin-api';

import type { IAAPService } from './IAAPService';

/**
 * A reference to the ansible service.
 *
 * No `defaultFactory` — the concrete `AAPClient` factory is registered by the
 * package that owns the HTTP client (`backstage-rhaap-common` during
 * transition, then `@ansible/aap-backend`).
 *
 * @public
 */
export const ansibleServiceRef = createServiceRef<IAAPService>({
  id: 'rhaap.client.service',
  scope: 'plugin',
});
