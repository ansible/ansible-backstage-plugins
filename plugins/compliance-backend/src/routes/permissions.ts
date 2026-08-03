import type express from 'express';
import type { HttpAuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';

export function getUserAapToken(req: express.Request): string | undefined {
  const header = req.headers['x-aap-token'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return undefined;
}

export async function requirePermission(
  req: express.Request,
  res: express.Response,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
): Promise<boolean> {
  if (!httpAuth || !permissions) {
    return true;
  }

  try {
    const credentials = await httpAuth.credentials(req);
    const [decision] = await permissions.authorize(
      [{ permission: catalogEntityCreatePermission }],
      { credentials },
    );

    if (decision.result !== AuthorizeResult.ALLOW) {
      res.status(403).json({
        error: 'Forbidden: this action requires admin permissions',
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

export async function requireAuth(
  req: express.Request,
  res: express.Response,
  httpAuth?: HttpAuthService,
): Promise<boolean> {
  if (!httpAuth) return true;
  try {
    await httpAuth.credentials(req);
    return true;
  } catch {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
}

export async function extractUserIdentity(
  req: express.Request,
  httpAuth?: HttpAuthService,
): Promise<string | undefined> {
  if (!httpAuth) return undefined;
  try {
    const credentials = await httpAuth.credentials(req);
    const principal = credentials.principal as { userEntityRef?: string } | undefined;
    return principal?.userEntityRef;
  } catch {
    return undefined;
  }
}
