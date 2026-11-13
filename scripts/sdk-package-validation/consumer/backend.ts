import { createBackendPlugin } from '@backstage/backend-plugin-api';
import {
  createPortalPlugin,
  portalHealthServiceRef,
} from '@ansible/portal-plugin-node';
import type { OperationRequest } from '@ansible/portal-extension-common';
export function requestIdentity(request: OperationRequest): string {
  return request.subject.entityRef;
}
export default createBackendPlugin({
  pluginId: 'external-consumer',
  register(reg) {
    reg.registerInit({
      deps: { health: portalHealthServiceRef },
      async init({ health }) {
        const sdk = createPortalPlugin({
          pluginId: 'external-consumer',
          health,
        });
        sdk.pushHealthStatus({
          state: 'READY',
          message: 'External consumer initialized',
        });
      },
    });
  },
});
