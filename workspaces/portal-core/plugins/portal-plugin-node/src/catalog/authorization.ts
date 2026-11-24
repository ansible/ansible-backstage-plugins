import type { Request, Response, RequestHandler, NextFunction } from 'express';
import type {
  BackstageCredentials,
  HttpAuthService,
  UserInfoService,
  AuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import type { CatalogClient } from '@backstage/catalog-client';
import {
  type Permission,
  type BasicPermission,
  type ResourcePermission,
  AuthorizeResult,
} from '@backstage/plugin-permission-common';

export interface RequireSuperuserDeps {
  superuserAnnotation: string;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  catalogClient: CatalogClient;
  logger: LoggerService;
  /**
   * When set, only service principals with this subject are allowed as external access.
   * Typically populated from backend.auth.externalAccess[].options.subject in app-config.
   * If empty/undefined, any service principal is allowed.
   */
  allowedExternalAccessSubjects?: string[];
}

/**
 * Returns a function that checks the request has a catalog user with
 * the configured superuser annotation. If not, sends 403 and returns false.
 */
export function checkRequireSuperuser(
  deps: RequireSuperuserDeps,
): (req: Request, res: Response) => Promise<boolean> {
  const {
    httpAuth,
    userInfo,
    auth,
    catalogClient,
    logger,
    allowedExternalAccessSubjects,
  } = deps;
  return async (req: Request, res: Response): Promise<boolean> => {
    try {
      const credentials = await httpAuth.credentials(req as any, {
        allow: ['service', 'user'],
      });
      // Service principal = external access token (from backend.auth.externalAccess in app-config).
      if (auth.isPrincipal(credentials, 'service')) {
        const subject = credentials.principal.subject;
        const allowed =
          !allowedExternalAccessSubjects?.length ||
          allowedExternalAccessSubjects.includes(subject);
        if (allowed) {
          logger.info(
            `Allowing sync request: external access (service principal, subject=${subject})`,
          );
          return true;
        }
        logger.warn(
          `Rejecting sync request: service principal subject '${subject}' not in allowedExternalAccessSubjects`,
        );
        res.status(403).json({
          error:
            'Forbidden: external access subject not allowed for this endpoint',
        });
        return false;
      }
      // User principal: require superuser in catalog.
      const { userEntityRef } = await userInfo.getUserInfo(credentials);
      const { token } = await auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'catalog',
      });
      const userEntity = await catalogClient.getEntityByRef(userEntityRef, {
        token,
      });
      const isSuperuser =
        userEntity?.metadata?.annotations?.[deps.superuserAnnotation] ===
        'true';
      if (!isSuperuser) {
        res.status(403).json({ error: 'Forbidden: superuser access required' });
        return false;
      }
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Superuser check failed: ${errorMessage}`);
      res.status(500).json({
        error: `Authorization failed: ${errorMessage}`,
      });
      return false;
    }
  };
}

/**
 * Returns an Express middleware that requires superuser. Use as a route
 * decorator: router.get('/path', requireSuperuserMiddleware, handler).
 * On success calls next(); on failure sends 403/500 and does not call next().
 */
export function createRequireSuperuserMiddleware(
  deps: RequireSuperuserDeps,
): RequestHandler {
  const requireSuperuser = checkRequireSuperuser(deps);
  return async (req: Request, res: Response, next: (err?: unknown) => void) => {
    const allowed = await requireSuperuser(req, res);
    if (allowed) next();
  };
}

/* ------------------------------------------------------------------ */
/*  Permission-check middleware factory                                */
/* ------------------------------------------------------------------ */

export interface PermissionMiddlewareDeps {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
}

/**
 * Creates an Express middleware that resolves credentials and evaluates a
 * mixed list of basic and resource permissions.
 *
 * Basic permissions (`type: 'basic'`) are checked via `authorize`; the result
 * is `true` when `AuthorizeResult.ALLOW`.
 *
 * Resource permissions (`type: 'resource'`) are checked via
 * `authorizeConditional`; the result is `true` when the decision is **not**
 * `AuthorizeResult.DENY` (i.e. ALLOW or CONDITIONAL).
 *
 * On success the following are attached to `response.locals`:
 *  - `credentials`  – the resolved {@link BackstageCredentials}
 *  - `permissions`  – a `Record<string, boolean>` keyed by permission name
 *
 * The middleware does **not** enforce any policy; it is the caller's
 * responsibility to inspect the map and return 403 when appropriate.
 *
 * @param deps - httpAuth and permissions services
 * @param permissionsToCheck - basic and/or resource permissions to evaluate
 */
export function createPermissionCheckMiddleware(
  deps: PermissionMiddlewareDeps,
  permissionsToCheck: Permission[],
): RequestHandler {
  const { httpAuth, permissions } = deps;

  const basicPerms = permissionsToCheck.filter(
    (p): p is BasicPermission => p.type === 'basic',
  );
  const resourcePerms = permissionsToCheck.filter(
    (p): p is ResourcePermission => p.type === 'resource',
  );

  return async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const credentials: BackstageCredentials =
        response.locals.credentials ??
        (await httpAuth.credentials(request as any));

      const [basicDecisions, conditionalDecisions] = await Promise.all([
        basicPerms.length
          ? permissions.authorize(
              basicPerms.map(permission => ({ permission })),
              { credentials },
            )
          : Promise.resolve([]),
        resourcePerms.length
          ? permissions.authorizeConditional(
              resourcePerms.map(permission => ({ permission })),
              { credentials },
            )
          : Promise.resolve([]),
      ]);

      const results: Record<string, boolean> = {};
      basicPerms.forEach((perm, i) => {
        results[perm.name] = basicDecisions[i].result === AuthorizeResult.ALLOW;
      });
      resourcePerms.forEach((perm, i) => {
        results[perm.name] =
          conditionalDecisions[i].result !== AuthorizeResult.DENY;
      });

      response.locals.credentials = credentials;
      response.locals.permissions = results;
      next();
    } catch (err) {
      next(err);
    }
  };
}
