import { createBackendPlugin } from '@backstage/backend-plugin-api';
import {
  createPortalPlugin,
  portalHealthServiceRef,
  portalCatalogEntityProvidersServiceRef,
  type CatalogEntityProvidersService,
  type CatalogEntityRegistrationState,
} from '@ansible/portal-plugin-node';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import type { OperationRequest } from '@ansible/portal-extension-common';
export function requestIdentity(request: OperationRequest): string {
  return request.subject.entityRef;
}

// A separately packaged consumer needs only the SDK contract. Authorization
// remains caller-owned and must complete inside the provider's mutation scope.
export async function contributeEntity(
  providers: CatalogEntityProvidersService,
  providerId: string,
  entity: Entity,
  authorize: (state: CatalogEntityRegistrationState) => Promise<void>,
): Promise<void> {
  await providers
    .get(providerId)
    .withEntityMutation(
      { entityRef: stringifyEntityRef(entity) },
      async mutation => {
        await authorize(mutation.registrationState);
        await mutation.upsert(entity);
      },
    );
}
export default createBackendPlugin({
  pluginId: 'external-consumer',
  register(reg) {
    reg.registerInit({
      deps: {
        health: portalHealthServiceRef,
        providers: portalCatalogEntityProvidersServiceRef,
      },
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
