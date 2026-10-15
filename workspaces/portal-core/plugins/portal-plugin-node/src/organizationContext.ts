import type {
  BackstageCredentials,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import type { ActiveOrganizationResolver } from './entitlements';
import { resolveOrganizationMemberships } from './entitlements';
import type { PortalContext } from './types';

/** Resolve identity and deployment scope independently; neither comes from input. */
export async function resolvePortalContext(options: {
  credentials: BackstageCredentials;
  userInfo: UserInfoService;
  organizations: ActiveOrganizationResolver;
}): Promise<PortalContext> {
  const principal = options.credentials.principal;
  if (
    !principal ||
    typeof principal !== 'object' ||
    !('type' in principal) ||
    principal.type !== 'user'
  ) {
    throw new NotAllowedError(
      'Portal operations require an authenticated user',
    );
  }
  const identity = await options.userInfo.getUserInfo(options.credentials);
  const match = /^user:[^/]+\/([^/]+)$/i.exec(identity.userEntityRef);
  if (!match) throw new NotAllowedError('Invalid Portal user identity');
  let memberships: readonly string[];
  try {
    memberships = await resolveOrganizationMemberships(
      options.organizations,
      options.credentials,
    );
  } catch {
    throw new NotAllowedError('Active organization could not be resolved');
  }
  if (!memberships.length) {
    throw new NotAllowedError('Active organization is missing or ambiguous');
  }
  return {
    userEntityRef: identity.userEntityRef,
    userId: match[1],
    ...(memberships.length === 1
      ? { organizationId: memberships[0] }
      : { organizationIds: memberships }),
  };
}
