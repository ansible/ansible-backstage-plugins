import {
  AuthResolverContext,
  createSignInResolverFactory,
  OAuthAuthenticatorResult,
  PassportProfile,
  SignInInfo,
} from '@backstage/plugin-auth-node';
import { AuthenticationError } from '@backstage/errors';
import {
  DEFAULT_NAMESPACE,
  Entity,
  RELATION_MEMBER_OF,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import type { Config } from '@backstage/config';
import {
  IUserProvisioner,
  toUserEntityName,
} from '@ansible/backstage-rhaap-common';

function readMultiOrgEnabled(config?: Config): boolean {
  const providers = config?.getOptionalConfig('catalog.providers.rhaap');
  return (
    providers
      ?.keys()
      .some(
        key =>
          providers.getConfig(key).getOptionalBoolean('multiOrgEnabled') ===
          true,
      ) ?? false
  );
}

function catalogUserName(
  username: string,
  id: number,
  config?: Config,
): string {
  const multiOrgEnabled = readMultiOrgEnabled(config);
  if (multiOrgEnabled && (!Number.isSafeInteger(id) || id < 1)) {
    throw new AuthenticationError(
      'AAP user ID is required when multi-org mode is enabled',
    );
  }
  return toUserEntityName(username, id, { multiOrgEnabled });
}

const AAP_ADMINS_GROUP = 'group:default/aap-admins';
const SUPERUSER_ANNOTATION = 'aap.platform/is_superuser';

/**
 * Issues a sign-in token with ownership entity refs that include group
 * memberships from catalog relations AND the aap-admins group for superusers.
 *
 * This bypasses a race condition where signInWithCatalogUser reads
 * entity.relations before the catalog has stitched memberOf relations
 * for newly created users.
 */
async function issueTokenWithOwnership(
  ctx: AuthResolverContext,
  entity: Entity,
) {
  const userRef = stringifyEntityRef(entity);

  const memberOfRefs =
    entity.relations
      ?.filter(
        r => r.type === RELATION_MEMBER_OF && r.targetRef.startsWith('group:'),
      )
      .map(r => r.targetRef) ?? [];

  const ownershipRefs = new Set([userRef, ...memberOfRefs]);

  if (entity.metadata?.annotations?.[SUPERUSER_ANNOTATION] === 'true') {
    ownershipRefs.add(AAP_ADMINS_GROUP);
  }

  return ctx.issueToken({
    claims: {
      sub: userRef,
      ent: Array.from(ownershipRefs),
    },
  });
}

export namespace AAPAuthSignInResolvers {
  /**
   * Sign in resolver that only allows catalog users to log in.
   * Users must be pre-provisioned in the catalog (e.g. via the scheduled
   * AAPEntityProvider sync) before they can sign in.
   */
  export const usernameMatchingUser = ({ config }: { config?: Config }) =>
    createSignInResolverFactory({
      create() {
        return async (
          info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>>,
          ctx: AuthResolverContext,
        ) => {
          const { result } = info;
          const username = result.fullProfile.username;
          if (!username) {
            throw new AuthenticationError(
              `Oauth2 user profile does not contain a username`,
            );
          }

          const name = catalogUserName(
            username,
            Number(result.fullProfile.id),
            config,
          );

          try {
            const { entity } = await ctx.findCatalogUser({
              entityRef: { name },
            });
            return issueTokenWithOwnership(ctx, entity);
          } catch (e) {
            if (e instanceof AuthenticationError) {
              throw e;
            }
            const dangerouslyAllowSignInWithoutUserInCatalog =
              config?.getOptionalBoolean(
                'dangerouslyAllowSignInWithoutUserInCatalog',
              ) ?? false;

            if (!dangerouslyAllowSignInWithoutUserInCatalog) {
              throw new AuthenticationError(
                `Sign in failed: User not found in the RH AAP software catalog. Verify that users/groups are synchronized to the software catalog. For non-production environments, manually provision the user or disable the user provisioning requirement. Refer to the RH AAP Authentication documentation for further details.`,
              );
            }

            const userEntity = stringifyEntityRef({
              kind: 'User',
              name,
              namespace: DEFAULT_NAMESPACE,
            });

            return ctx.issueToken({
              claims: {
                sub: userEntity,
                ent: [userEntity],
              },
            });
          }
        };
      },
    });

  /** Config-based factory compatible with the upstream resolver entry point. */
  export const createUsernameMatchingUser = (config?: Config) =>
    usernameMatchingUser({ config });

  /**
   * Sign in resolver that automatically creates users in the catalog if they
   * don't exist yet, using the userProvisionerRef service.
   * Requires catalog-backend-module-rhaap-user-provisioner to be installed.
   */
  export const allowNewAAPUserSignIn = ({
    userProvisioner,
    config,
  }: {
    userProvisioner: IUserProvisioner;
    config?: Config;
  }) =>
    createSignInResolverFactory({
      create() {
        return async (
          info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>>,
          ctx: AuthResolverContext,
        ) => {
          const { result } = info;
          const username = result.fullProfile.username;
          const userID = Number(result.fullProfile.id);
          if (!username || !result.fullProfile.id || Number.isNaN(userID)) {
            throw new AuthenticationError(
              `Oauth2 user profile does not contain a username or user ID`,
            );
          }

          const name = catalogUserName(username, userID, config);

          // Check if user already exists in catalog.
          let userExists = false;
          try {
            await ctx.findCatalogUser({ entityRef: { name } });
            userExists = true;
          } catch {
            // User not found — provision them.
          }

          if (!userExists) {
            await userProvisioner.createUser(username, userID);
          }

          // Retry findCatalogUser with exponential backoff to handle catalog
          // processing latency: applyMutation() returns before entity stitching
          // completes, so the entity may not be immediately queryable.
          const MAX_RETRIES = 5;
          const BASE_DELAY_MS = 500;
          let lastError: unknown;

          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (attempt > 0) {
              await new Promise(resolve =>
                setTimeout(resolve, BASE_DELAY_MS * attempt),
              );
            }
            try {
              const { entity } = await ctx.findCatalogUser({
                entityRef: { name },
              });
              return await issueTokenWithOwnership(ctx, entity);
            } catch (e) {
              lastError = e;
            }
          }

          throw new AuthenticationError(
            `Sign in failed: User ${username} not found in catalog after provisioning. ` +
              `This may indicate a configuration issue with organization membership or catalog sync. ` +
              `Verify that users/groups are synchronized to the software catalog. Error: ${lastError}`,
          );
        };
      },
    });
}
