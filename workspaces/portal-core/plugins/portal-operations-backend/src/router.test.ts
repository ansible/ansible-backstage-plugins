import express from 'express';
import request from 'supertest';
import { mockServices } from '@backstage/backend-test-utils';
import { createRouter } from './router';
import type { PortalOperations } from '@ansible/portal-plugin-node';

describe('operation transport', () => {
  const execute = jest.fn();
  const httpAuth = mockServices.httpAuth.mock();
  const userInfo = mockServices.userInfo.mock();
  const permissions = mockServices.permissions.mock();
  const organizations = { resolve: jest.fn().mockResolvedValue('acme') };
  const app = express();
  app.use(
    createRouter({
      operations: { execute } as unknown as PortalOperations,
      httpAuth,
      userInfo,
      permissions,
      organizations,
    }),
  );
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(err.name === 'InputError' ? 400 : 401)
        .json({ error: err.message });
    },
  );
  beforeEach(() => {
    jest.clearAllMocks();
    organizations.resolve.mockResolvedValue('acme');
    httpAuth.credentials.mockResolvedValue({
      $$type: '@backstage/BackstageCredentials',
      principal: { type: 'user', userEntityRef: 'user:acme/alice' },
      expiresAt: undefined,
    });
    userInfo.getUserInfo.mockResolvedValue({
      userEntityRef: 'user:acme/alice',
      ownershipEntityRefs: [],
    });
    execute.mockResolvedValue({ jobId: '123' });
  });
  it('passes authenticated context and the canonical subject to the dispatcher', async () => {
    await request(app)
      .post('/apme.quality.scan')
      .send({ subject: { entityRef: 'component:acme/repo' } })
      .expect(200, { result: { jobId: '123' } });
    expect(httpAuth.credentials).toHaveBeenCalledWith(expect.anything(), {
      allow: ['user'],
    });
    expect(execute).toHaveBeenCalledWith(
      'apme.quality.scan',
      expect.objectContaining({
        subject: { entityRef: 'component:acme/repo' },
      }),
      expect.objectContaining({ organizationId: 'acme', userId: 'alice' }),
      permissions,
    );
  });
  it('returns authenticated context for frontend SDK consumers without using namespace as organization', async () => {
    userInfo.getUserInfo.mockResolvedValue({
      userEntityRef: 'user:default/alice',
      ownershipEntityRefs: [],
    });
    await request(app).get('/context').expect(200, {
      userEntityRef: 'user:default/alice',
      userId: 'alice',
      organizationId: 'acme',
    });
    expect(execute).not.toHaveBeenCalled();
  });
  it('returns multiple trusted memberships without selecting the first as active', async () => {
    const multiOrgApp = express();
    multiOrgApp.use(
      createRouter({
        operations: { execute } as unknown as PortalOperations,
        httpAuth,
        userInfo,
        permissions,
        organizations: {
          resolve: jest.fn().mockResolvedValue(undefined),
          resolveAll: jest.fn().mockResolvedValue(['finance', 'engineering']),
        },
      }),
    );
    userInfo.getUserInfo.mockResolvedValue({
      userEntityRef: 'user:default/alice',
      ownershipEntityRefs: [],
    });
    await request(multiOrgApp)
      .get('/context')
      .expect(200, {
        userEntityRef: 'user:default/alice',
        userId: 'alice',
        organizationIds: ['engineering', 'finance'],
      });
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires authentication before returning organization context', async () => {
    httpAuth.credentials.mockRejectedValue(new Error('Unauthenticated'));
    await request(app).get('/context').expect(401);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { subject: {} },
    { subject: { entityRef: 123 } },
    {
      subject: { entityRef: 'component:acme/repo' },
      organizationId: 'another-org',
    },
    { subject: { entityRef: 'component:acme/repo', projectId: '123' } },
    { subject: { entityRef: 'component:acme/repo' }, input: [] },
  ])('rejects malformed requests: %j', async body => {
    await request(app).post('/apme.quality.scan').send(body).expect(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('does not invoke on authentication failure', async () => {
    httpAuth.credentials.mockRejectedValue(new Error('Unauthenticated'));
    await request(app)
      .post('/apme.quality.scan')
      .send({ subject: { entityRef: 'component:acme/repo' } })
      .expect(401);
    expect(execute).not.toHaveBeenCalled();
  });
  it('uses configured organization even for a default-namespace identity', async () => {
    userInfo.getUserInfo.mockResolvedValue({
      userEntityRef: 'user:default/alice',
      ownershipEntityRefs: [],
    });
    await request(app)
      .post('/apme.quality.scan')
      .send({ subject: { entityRef: 'component:default/repo' } })
      .expect(200);
    expect(execute).toHaveBeenCalledWith(
      'apme.quality.scan',
      expect.anything(),
      expect.objectContaining({
        organizationId: 'acme',
        userEntityRef: 'user:default/alice',
      }),
      permissions,
    );
  });
  it('does not dispatch when the active organization is unresolved', async () => {
    organizations.resolve.mockResolvedValue(undefined);
    await request(app)
      .post('/apme.quality.scan')
      .send({ subject: { entityRef: 'component:acme/repo' } })
      .expect(401);
    expect(execute).not.toHaveBeenCalled();
  });
});
