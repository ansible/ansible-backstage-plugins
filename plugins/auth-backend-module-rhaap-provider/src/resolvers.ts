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
  // Sign in resolver that lets only catalog users log in if they exist.
  export const usernameMatchingUser = createSignInResolverFactory({
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

        try {
          const { entity } = await ctx.findCatalogUser({
            entityRef: { name: username },
          });
          return issueTokenWithOwnership(ctx, entity);
        } catch (e) {
          const config = await ConfigSources.toConfig(
            ConfigSources.default({}),
          );
          const dangerouslyAllowSignInWithoutUserInCatalog =
            config.getOptionalBoolean(
              'dangerouslyAllowSignInWithoutUserInCatalog',
            ) || false;
          if (!dangerouslyAllowSignInWithoutUserInCatalog) {
            throw new AuthenticationError(
              `Sign in failed: User not found in the RH AAP software catalog. Verify that users/groups are synchronized to the software catalog. For non-production environments, manually provision the user or disable the user provisioning requirement. Refer to the RH AAP Authentication documentation for further details.`,
            );
          }
          const userEntity = stringifyEntityRef({
            kind: 'User',
            name: username,
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

  // Default Sign In Resolver
  // Sign in resolver that automatically creates users in the catalog if they don't exist.
  export const allowNewAAPUserSignIn = ({
    discovery,
    auth,
  }: {
    discovery: DiscoveryService;
    auth: AuthService;
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

          try {
            if (username) {
              await ctx.findCatalogUser({
                entityRef: { name: username },
              });
            }
          } catch {
            await createUserInCatalog(username, userID, discovery, auth);
          }
          // Wait a bit more to ensure catalog has processed the user
          await new Promise(resolve => setTimeout(resolve, 2000));

          try {
            const { entity } = await ctx.findCatalogUser({
              entityRef: { name: username },
            });
            return await issueTokenWithOwnership(ctx, entity);
          } catch (e) {
            // Try to find the user again to provide better error information
            try {
              await ctx.findCatalogUser({
                entityRef: { name: username },
              });
              // User exists but token issuance failed for another reason
              throw new AuthenticationError(
                `Sign in failed: User ${username} exists in catalog but sign-in failed. Error: ${e}`,
              );
            } catch (findError) {
              // User still doesn't exist in catalog
              throw new AuthenticationError(
                `Sign in failed: User ${username} not found in the RH AAP catalog after creation attempt. This may indicate a configuration issue with organization membership or catalog sync. Verify that users/groups are synchronized to the software catalog. Original error: ${e}. Find error: ${findError}`,
              );
            }
          }
        };
      },
    });
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
    console.log(
      `[Auth Resolver] Waiting 3 seconds for catalog to process user ${username}`,
    );
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for catalog to process the new user
  } catch (error) {
    console.error(
      `[Auth Resolver] Overall error creating user ${username}:`,
      error,
    );
    throw error;
  }
}
