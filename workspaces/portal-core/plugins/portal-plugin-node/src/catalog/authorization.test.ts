/**
 * @jest-environment node
 */
import { createPermissionCheckMiddleware } from './authorization';

import { AuthorizeResult } from '@backstage/plugin-permission-common';

describe('catalog permission middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createPermissionCheckMiddleware', () => {
    let mockHttpAuth: any;
    let mockPermissions: any;
    let deps: any;

    beforeEach(() => {
      mockHttpAuth = {
        credentials: jest
          .fn()
          .mockResolvedValue({ principal: { type: 'user' } }),
      };
      mockPermissions = {
        authorize: jest.fn().mockResolvedValue([]),
        authorizeConditional: jest.fn().mockResolvedValue([]),
      };
      deps = { httpAuth: mockHttpAuth, permissions: mockPermissions };
    });

    function makeMockReqRes() {
      const req = { headers: {} } as any;
      const res = {
        locals: {},
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const next = jest.fn();
      return { req, res, next };
    }

    it('attaches credentials and permission results to response.locals', async () => {
      const basicPerm = {
        type: 'basic' as const,
        name: 'test.view',
        attributes: {},
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [basicPerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.credentials).toEqual({ principal: { type: 'user' } });
      expect(res.locals.permissions).toEqual({ 'test.view': true });
      expect(next).toHaveBeenCalledWith();
    });

    it('maps DENY to false for basic permissions', async () => {
      const perm = {
        type: 'basic' as const,
        name: 'test.view',
        attributes: {},
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.DENY },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [perm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({ 'test.view': false });
      expect(next).toHaveBeenCalled();
    });

    it('handles resource permissions via authorizeConditional', async () => {
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.CONDITIONAL },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [resourcePerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({ 'catalog.entity.read': true });
      expect(next).toHaveBeenCalled();
    });

    it('maps DENY to false for resource permissions', async () => {
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.DENY },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [resourcePerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({ 'catalog.entity.read': false });
    });

    it('handles mixed basic and resource permissions', async () => {
      const basicPerm = {
        type: 'basic' as const,
        name: 'ee.view',
        attributes: {},
      };
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.CONDITIONAL },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [
        basicPerm,
        resourcePerm,
      ]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({
        'ee.view': true,
        'catalog.entity.read': true,
      });
    });

    it('skips authorize call when no basic permissions', async () => {
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [resourcePerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(mockPermissions.authorize).not.toHaveBeenCalled();
      expect(mockPermissions.authorizeConditional).toHaveBeenCalled();
    });

    it('skips authorizeConditional call when no resource permissions', async () => {
      const basicPerm = {
        type: 'basic' as const,
        name: 'ee.view',
        attributes: {},
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [basicPerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(mockPermissions.authorizeConditional).not.toHaveBeenCalled();
    });

    it('calls next(err) when httpAuth.credentials throws', async () => {
      const perm = { type: 'basic' as const, name: 'ee.view', attributes: {} };
      const error = new Error('auth failed');
      mockHttpAuth.credentials.mockRejectedValue(error);

      const middleware = createPermissionCheckMiddleware(deps, [perm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
