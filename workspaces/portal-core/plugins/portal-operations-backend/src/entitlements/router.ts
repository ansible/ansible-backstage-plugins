import express from 'express';
import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { InputError, NotAllowedError } from '@backstage/errors';
import type {
  AuthService,
  HttpAuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import type { CatalogClient } from '@backstage/catalog-client';
import type { PortalEntitlements } from '@ansible/portal-plugin-node';

/** Read-only host authorization adapter. Callers send IDs, never grants or permissions. */
export function createEntitlementsRouter(options: {
  entitlements: PortalEntitlements;
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  auth: AuthService;
  catalog: CatalogClient;
}): express.Router {
  const router = express.Router();
  router.get('/entitlements/:entitlementId', async (req, res) => {
    const credentials = await options.httpAuth.credentials(
      req as unknown as Parameters<HttpAuthService['credentials']>[0],
      { allow: ['user'] },
    );
    if (
      typeof req.query.entityRef !== 'string' ||
      Object.keys(req.query).some(key => key !== 'entityRef')
    )
      throw new InputError(
        'Expected only entityRef; organization and grants are host-owned',
      );
    let entityRef: string;
    try {
      entityRef = stringifyEntityRef(parseEntityRef(req.query.entityRef));
    } catch {
      throw new InputError('Invalid entity reference');
    }
    const { token } = await options.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    const entity = await options.catalog.getEntityByRef(entityRef, { token });
    if (!entity) throw new NotAllowedError('Entity is not accessible');
    res.json(
      await options.entitlements.check(
        req.params.entitlementId,
        credentials,
        options.permissions,
      ),
    );
  });
  return router;
}
