import express from 'express';
import request from 'supertest';
import { mockServices } from '@backstage/backend-test-utils';
import type { CatalogClient } from '@backstage/catalog-client';
import type { PortalEntitlements } from '@ansible/portal-plugin-node';
import { createEntitlementsRouter } from './router';

describe('entitlement transport', () => {
  const check = jest.fn();
  const getEntityByRef = jest.fn();
  const httpAuth = mockServices.httpAuth.mock();
  const auth = mockServices.auth.mock();
  const permissions = mockServices.permissions.mock();
  const credentials = {
    $$type: '@backstage/BackstageCredentials' as const,
    principal: { type: 'user' as const, userEntityRef: 'user:default/alice' },
    expiresAt: undefined,
  };
  const app = express();
  app.use(
    createEntitlementsRouter({
      entitlements: { check } as unknown as PortalEntitlements,
      catalog: { getEntityByRef } as unknown as CatalogClient,
      httpAuth,
      auth,
      permissions,
    }),
  );
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const statuses: Record<string, number> = {
        InputError: 400,
        NotAllowedError: 403,
      };
      res.status(statuses[error.name] ?? 401).json({ error: error.message });
    },
  );
  beforeEach(() => {
    jest.clearAllMocks();
    httpAuth.credentials.mockResolvedValue(credentials);
    auth.getPluginRequestToken.mockResolvedValue({
      token: 'test-catalog-token',
    });
    getEntityByRef.mockResolvedValue({ metadata: { name: 'repo' } });
    check.mockResolvedValue({ allowed: true, organizationId: 'default' });
  });
  it('forwards authenticated credentials and checks subject read access', async () => {
    await request(app)
      .get('/entitlements/apme.scanning')
      .query({ entityRef: 'Component:DEFAULT/repo' })
      .expect(200, { allowed: true, organizationId: 'default' });
    expect(httpAuth.credentials).toHaveBeenCalledWith(expect.anything(), {
      allow: ['user'],
    });
    expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    expect(getEntityByRef).toHaveBeenCalledWith('component:default/repo', {
      token: 'test-catalog-token',
    });
    expect(check).toHaveBeenCalledWith(
      'apme.scanning',
      credentials,
      permissions,
    );
  });
  it.each([
    {},
    { entityRef: 'component:/repo' },
    { entityRef: 'component:default/repo', organizationId: 'other' },
    { entityRef: 'component:default/repo', permissionName: 'allow.all' },
    { entityRef: 'component:default/repo', scope: 'global' },
  ])('rejects malformed or client-owned policy %j', async query => {
    await request(app)
      .get('/entitlements/apme.scanning')
      .query(query)
      .expect(400);
    expect(check).not.toHaveBeenCalled();
  });
  it('denies inaccessible catalog subjects', async () => {
    getEntityByRef.mockResolvedValue(undefined);
    await request(app)
      .get('/entitlements/apme.scanning')
      .query({ entityRef: 'component:default/repo' })
      .expect(403);
    expect(check).not.toHaveBeenCalled();
  });
  it('does not evaluate after authentication or catalog failure', async () => {
    httpAuth.credentials.mockRejectedValue(new Error('Unauthenticated'));
    await request(app)
      .get('/entitlements/apme.scanning')
      .query({ entityRef: 'component:default/repo' })
      .expect(401);
    expect(check).not.toHaveBeenCalled();
  });
});
