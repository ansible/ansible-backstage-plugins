import type express from 'express';
import type { HttpAuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { BasicPermission } from '@backstage/plugin-permission-common';

export function getUserAapToken(req: express.Request): string | undefined {
  const header = req.headers['x-aap-token'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return undefined;
}

/**
 * Enforce a specific compliance permission on a route.
 *
 * `permission` must be one of the constants exported from
 * `@ansible/compliance-common`'s `permissions.ts` (e.g.
 * `scanLaunchPermission`, `remediateLaunchPermission`,
 * `profileManagePermission`, `findingsIngestPermission`). Callers must
 * always pass the permission that matches the action being performed —
 * there is no implicit default, so every mutating route is explicit about
 * what it requires.
 *
 * When `httpAuth`/`permissions` are not provided (development auth mode),
 * this is a no-op that allows the request through.
 */
export async function requirePermission(
  req: express.Request,
  res: express.Response,
  httpAuth: HttpAuthService | undefined,
  permissions: PermissionsService | undefined,
  permission: BasicPermission,
): Promise<boolean> {
  if (!httpAuth || !permissions) {
    return true;
  }

  try {
    // Express Request (express-promise-router) vs Backstage's `credentials` param use incompatible Express generics; runtime value is valid.
    // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS.
    const credentials = await httpAuth.credentials(req);
    const [decision] = await permissions.authorize(
      [{ permission }],
      { credentials },
    );

    if (decision.result !== AuthorizeResult.ALLOW) {
      res.status(403).json({
        error: `Forbidden: this action requires the '${permission.name}' permission`,
      });
      return false;
    }

    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(403).json({ error: `Authorization failed: ${msg}` });
    return false;
  }
}

export async function extractUserIdentity(
  req: express.Request,
  httpAuth?: HttpAuthService,
): Promise<string | undefined> {
  if (!httpAuth) return undefined;
  try {
    // Express Request (express-promise-router) vs Backstage's `credentials` param use incompatible Express generics; runtime value is valid.
    // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS.
    const credentials = await httpAuth.credentials(req);
    const principal = credentials.principal as { userEntityRef?: string } | undefined;
    return principal?.userEntityRef;
  } catch {
    return undefined;
  }
}
