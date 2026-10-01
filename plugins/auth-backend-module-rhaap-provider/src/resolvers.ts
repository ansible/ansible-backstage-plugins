import {
  AuthResolverContext,
  createSignInResolverFactory,
  OAuthAuthenticatorResult,
  PassportProfile,
  SignInInfo,
} from '@backstage/plugin-auth-node';
import { AuthenticationError } from '@backstage/errors';
import { ConfigSources } from '@backstage/config-loader';
import {
  DEFAULT_NAMESPACE,
  Entity,
  RELATION_MEMBER_OF,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { DiscoveryService, AuthService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { toUserEntityName } from '@ansible/backstage-rhaap-common';

const AAP_ADMINS_GROUP = 'group:default/aap-admins';
const SUPERUSER_ANNOTATION = 'aap.platform/is_superuser';

function toCatalogUserEntityName(
  username: string,
  userId: number | undefined,
  multiOrgEnabled: boolean,
): string {
  if (multiOrgEnabled && userId === undefined) {
    throw new AuthenticationError(
      'AAP user ID is required when multi-org mode is enabled',
    );
  }
  return multiOrgEnabled
    ? toUserEntityName(username, userId, {
        multiOrgEnabled: true,
        source: 'aap',
      })
    : username;
}

function readMultiOrgEnabled(config: Config | undefined): boolean {
  if (!config) return false;
  const providers = config.getOptionalConfig('catalog.providers.rhaap');
  return (
    providers
      ?.keys()
      .some(
        id =>
          providers.getConfig(id).getOptionalBoolean('multiOrgEnabled') ===
          true,
      ) ?? false
  );
}

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
  // Sign in resolver that lets only catalog users log in if they exist.
  export const createUsernameMatchingUser = (config?: Config) =>
    createSignInResolverFactory({
      create() {
        return async (
          info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>>,
          ctx: AuthResolverContext,
        ) => {
          const { result } = info;
          const username = result.fullProfile.username;
          const parsedUserId = Number(result.fullProfile.id);
          const userId = Number.isNaN(parsedUserId) ? undefined : parsedUserId;
          const multiOrgEnabled = readMultiOrgEnabled(config);
          if (!username) {
            throw new AuthenticationError(
              `Oauth2 user profile does not contain a username`,
            );
          }

          // Resolve catalog identity before the catalog lookup try/catch so
          // multi-org validation errors are not rewritten as "user not found".
          const catalogUserName = toCatalogUserEntityName(
            username,
            userId,
            multiOrgEnabled,
          );

          try {
            const { entity } = await ctx.findCatalogUser({
              entityRef: {
                name: catalogUserName,
              },
            });
            return issueTokenWithOwnership(ctx, entity);
          } catch (e) {
            if (e instanceof AuthenticationError) {
              throw e;
            }
            const fallbackConfig = await ConfigSources.toConfig(
              ConfigSources.default({}),
            );
            const dangerouslyAllowSignInWithoutUserInCatalog =
              fallbackConfig.getOptionalBoolean(
                'dangerouslyAllowSignInWithoutUserInCatalog',
              ) || false;
            if (!dangerouslyAllowSignInWithoutUserInCatalog) {
              throw new AuthenticationError(
                `Sign in failed: User not found in the RH AAP software catalog. Verify that users/groups are synchronized to the software catalog. For non-production environments, manually provision the user or disable the user provisioning requirement. Refer to the RH AAP Authentication documentation for further details.`,
              );
            }
            const userEntity = stringifyEntityRef({
              kind: 'User',
              name: catalogUserName,
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

  // Backwards-compatible single-org factory for direct consumers/tests.
  export const usernameMatchingUser = createUsernameMatchingUser();

  // Default Sign In Resolver
  // Sign in resolver that automatically creates users in the catalog if they don't exist.
  export const allowNewAAPUserSignIn = ({
    discovery,
    auth,
    config,
  }: {
    discovery: DiscoveryService;
    auth: AuthService;
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
          const multiOrgEnabled = readMultiOrgEnabled(config);
          if (!username || !result.fullProfile.id || Number.isNaN(userID)) {
            throw new AuthenticationError(
              `Oauth2 user profile does not contain a username or user ID`,
            );
          }

          const catalogUserName = toCatalogUserEntityName(
            username,
            userID,
            multiOrgEnabled,
          );

          // Fast path: user already exists in the catalog (true for every
          // sign-in after the user's first). Skip straight to token
          // issuance with no artificial delay - this keeps the OAuth
          // `/handler/frame` response fast, which matters because the
          // frontend popup is watching for that response and can perceive
          // a slow response as a closed/failed popup. Only a failure to
          // *find* the user triggers the create-and-wait path below; a
          // failure to issue the token for an already-found user is a
          // distinct, genuine error and must propagate as-is.
          let existingEntity: Entity | undefined;
          try {
            const { entity } = await ctx.findCatalogUser({
              entityRef: {
                name: catalogUserName,
              },
            });
            existingEntity = entity;
          } catch {
            existingEntity = undefined;
          }
          if (existingEntity) {
            return await issueTokenWithOwnership(ctx, existingEntity);
          }

          await createUserInCatalog(username, userID, discovery, auth);

          // The catalog processes the new user/entity asynchronously
          // (stitching relations, etc.), so poll for it rather than
          // blindly sleeping for a fixed duration - this returns as soon
          // as the entity is ready instead of always paying the worst-case
          // delay, while still bounding the total wait.
          const entity = await pollForCatalogUser(ctx, catalogUserName, {
            intervalMs: 300,
            maxAttempts: 30, // ~9s worst case (excluding network latency)
          });
          if (!entity) {
            throw new AuthenticationError(
              `Sign in failed: User ${username} not found in the RH AAP catalog after creation attempt. This may indicate a configuration issue with organization membership or catalog sync. Verify that users/groups are synchronized to the software catalog.`,
            );
          }
          return await issueTokenWithOwnership(ctx, entity);
        };
      },
    });
}

/**
 * Polls the catalog for a user entity until it appears or `maxAttempts`
 * is reached. Used after provisioning a new user, since catalog processing
 * (entity creation + relation stitching) happens asynchronously relative
 * to the `/aap/create_user` call that triggers it. Bounding by attempt
 * count (rather than a wall-clock deadline) returns as soon as the entity
 * is found and keeps behavior deterministic under fake/mocked timers.
 */
async function pollForCatalogUser(
  ctx: AuthResolverContext,
  catalogUserName: string,
  { intervalMs, maxAttempts }: { intervalMs: number; maxAttempts: number },
): Promise<Entity | undefined> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { entity } = await ctx.findCatalogUser({
        entityRef: { name: catalogUserName },
      });
      return entity;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
  }
  return undefined;
}

async function createUserInCatalog(
  username: string,
  userID: number,
  discovery: DiscoveryService,
  auth: AuthService,
): Promise<void> {
  try {
    console.log(
      `[Auth Resolver] Creating user ${username} (ID: ${userID}) in catalog`,
    );
    const baseUrl = await discovery.getBaseUrl('catalog');

    // Generate service token for authenticated request to catalog backend
    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });

    try {
      console.log(
        `[Auth Resolver] Calling ${baseUrl}/aap/create_user for user ${username}`,
      );
      const response = await fetch(`${baseUrl}/aap/create_user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, userID }),
      });

      if (response.ok) {
        const responseData = await response.text();
        console.log(
          `[Auth Resolver] Successfully created user ${username}: ${responseData}`,
        );
      } else {
        const errorText = await response.text();
        console.error(
          `[Auth Resolver] Failed to create user ${username}: ${response.status} ${errorText}`,
        );
        throw new Error(`Failed to create user: ${errorText}`);
      }
    } catch (syncError) {
      console.error(
        `[Auth Resolver] Error during user creation for ${username}:`,
        syncError,
      );
      throw syncError;
    }
  } catch (error) {
    console.error(
      `[Auth Resolver] Overall error creating user ${username}:`,
      error,
    );
    throw error;
  }
}
