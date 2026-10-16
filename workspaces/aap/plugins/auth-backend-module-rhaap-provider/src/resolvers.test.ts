import {
  AuthResolverContext,
  OAuthAuthenticatorResult,
  PassportProfile,
  SignInInfo,
} from '@backstage/plugin-auth-node';
import { AAPAuthSignInResolvers } from './resolvers';
import { IUserProvisioner } from '@ansible/backstage-rhaap-common';
import { ConfigReader } from '@backstage/config';
import { AuthenticationError } from '@backstage/errors';

function mockUserEntity(
  name: string,
  opts?: {
    isSuperuser?: boolean;
    memberOfGroups?: string[];
  },
) {
  const annotations: Record<string, string> = {};
  if (opts?.isSuperuser !== undefined) {
    annotations['aap.platform/is_superuser'] = String(opts.isSuperuser);
  }
  const relations = (opts?.memberOfGroups ?? []).map(g => ({
    type: 'memberOf',
    targetRef: `group:default/${g}`,
  }));
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: { name, namespace: 'default', annotations },
    spec: {},
    relations,
  };
}

function makeUserProvisioner(
  createUserImpl?: (username: string, userID: number) => Promise<boolean>,
): IUserProvisioner {
  return {
    createUser: createUserImpl ?? jest.fn().mockResolvedValue(true),
  };
}

const mockConfig = {
  getOptionalBoolean: jest.fn().mockReturnValue(false),
  getOptionalConfig: jest.fn().mockReturnValue(undefined),
};

describe('resolvers', () => {
  const multiOrgConfig = new ConfigReader({
    catalog: {
      providers: {
        rhaap: {
          dev: { orgs: ['Engineering', 'Finance'], multiOrgEnabled: true },
        },
      },
    },
  });
  const multiOrgInfo = {
    profile: { email: undefined, picture: undefined, displayName: 'Alice' },
    result: {
      session: {
        accessToken: 'at',
        tokenType: 'Bearer',
        scope: 'read',
        expiresInSeconds: 3600,
        refreshToken: 'rt',
      },
      fullProfile: {
        id: '42',
        provider: 'AAP oauth2',
        username: 'alice',
        displayName: 'Alice',
      },
    },
  };
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('uses the stable multi-org catalog identity during sign-in', async () => {
    const factory = AAPAuthSignInResolvers.usernameMatchingUser({
      config: multiOrgConfig,
    });
    const resolver = (factory as any)();
    const context = {
      findCatalogUser: jest
        .fn()
        .mockResolvedValue({ entity: mockUserEntity('aap-user-42') }),
      issueToken: jest.fn().mockResolvedValue({ token: 'token' }),
    };
    await resolver(multiOrgInfo, context);
    expect(context.findCatalogUser).toHaveBeenCalledWith({
      entityRef: { name: 'aap-user-42' },
    });
    expect(context.issueToken).toHaveBeenCalledWith({
      claims: {
        sub: 'user:default/aap-user-42',
        ent: ['user:default/aap-user-42'],
      },
    });
  });
  it.each([
    ['multi-org', multiOrgConfig, 'aap-user-42'],
    ['legacy', undefined, 'alice'],
  ] as const)(
    'supports the upstream config-based resolver factory in %s mode',
    async (_mode, config, catalogName) => {
      const resolver = (
        AAPAuthSignInResolvers.createUsernameMatchingUser(config) as any
      )();
      const context = {
        findCatalogUser: jest
          .fn()
          .mockResolvedValue({ entity: mockUserEntity(catalogName) }),
        issueToken: jest.fn().mockResolvedValue({ token: 'token' }),
      };
      await resolver(multiOrgInfo, context);
      expect(context.findCatalogUser).toHaveBeenCalledWith({
        entityRef: { name: catalogName },
      });
    },
  );

  it('preserves authentication errors instead of invoking the missing-user fallback', async () => {
    const resolver = (
      AAPAuthSignInResolvers.createUsernameMatchingUser(
        new ConfigReader({ dangerouslyAllowSignInWithoutUserInCatalog: true }),
      ) as any
    )();
    const error = new AuthenticationError('Catalog authentication denied');
    const context = {
      findCatalogUser: jest.fn().mockRejectedValue(error),
      issueToken: jest.fn(),
    };
    await expect(resolver(multiOrgInfo, context)).rejects.toBe(error);
    expect(context.issueToken).not.toHaveBeenCalled();
  });

  it('provisions a missing multi-org user through the extracted provisioner and looks up the same identity', async () => {
    const userProvisioner = makeUserProvisioner();
    const factory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
      config: multiOrgConfig,
      userProvisioner,
    });
    const resolver = (factory as any)();
    const context = {
      findCatalogUser: jest
        .fn()
        .mockRejectedValueOnce(new Error('Missing'))
        .mockResolvedValue({ entity: mockUserEntity('aap-user-42') }),
      issueToken: jest.fn().mockResolvedValue({ token: 'token' }),
    };
    await resolver(multiOrgInfo, context);
    expect(userProvisioner.createUser).toHaveBeenCalledWith('alice', 42);
    expect(context.findCatalogUser).toHaveBeenNthCalledWith(1, {
      entityRef: { name: 'aap-user-42' },
    });
    expect(context.findCatalogUser).toHaveBeenNthCalledWith(2, {
      entityRef: { name: 'aap-user-42' },
    });
  });
  it('rejects missing AAP IDs in multi-org mode before catalog lookup', async () => {
    const resolver = (
      AAPAuthSignInResolvers.createUsernameMatchingUser(multiOrgConfig) as any
    )();
    const context = { findCatalogUser: jest.fn(), issueToken: jest.fn() };
    await expect(
      resolver(
        {
          ...multiOrgInfo,
          result: {
            ...multiOrgInfo.result,
            fullProfile: { ...multiOrgInfo.result.fullProfile, id: undefined },
          },
        },
        context,
      ),
    ).rejects.toThrow('AAP user ID is required');
    expect(context.findCatalogUser).not.toHaveBeenCalled();
  });

  describe('usernameMatchingUser', () => {
    it('should sign in existing catalog user', async () => {
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser({
        config: mockConfig as any,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'test_emai@test.com',
          picture: undefined,
          displayName: 'Test User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: 'tUser',
            provider: 'AAP oauth2',
            username: 'tUser',
            email: 'test_emai@test.com',
            displayName: 'Test User',
          },
        },
      };

      const entity = mockUserEntity('tUser');
      const context = {
        findCatalogUser: jest.fn().mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
      } satisfies Partial<AuthResolverContext>;

      await resolver(info, context as any);
      expect(context.findCatalogUser).toHaveBeenCalledWith({
        entityRef: { name: 'tUser' },
      });
      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/tuser',
          ent: ['user:default/tuser'],
        },
      });
    });

    it('should include aap-admins for superuser', async () => {
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser({
        config: mockConfig as any,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'admin@test.com',
          picture: undefined,
          displayName: 'Admin User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: 'superAdmin',
            provider: 'AAP oauth2',
            username: 'superAdmin',
            email: 'admin@test.com',
            displayName: 'Admin User',
          },
        },
      };

      const entity = mockUserEntity('superAdmin', { isSuperuser: true });
      const context = {
        findCatalogUser: jest.fn().mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'admin-token' }),
      } satisfies Partial<AuthResolverContext>;

      await resolver(info, context as any);
      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/superadmin',
          ent: ['user:default/superadmin', 'group:default/aap-admins'],
        },
      });
    });

    it('should throw when username is missing from profile', async () => {
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser({
        config: mockConfig as any,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'test_emai@test.com',
          picture: undefined,
          displayName: 'Test User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: 'tUser',
            provider: 'AAP oauth2',
            email: 'test_emai@test.com',
            displayName: 'Test User',
          },
        },
      };

      const context = {} satisfies Partial<AuthResolverContext>;
      let error;
      try {
        await resolver(info, context as any);
      } catch (e: any) {
        error = e;
      }
      expect(error?.message).toBe(
        'Oauth2 user profile does not contain a username',
      );
    });

    it('should throw when user is not in catalog and dangerously flag is false', async () => {
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser({
        config: mockConfig as any,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {},
        result: {
          session: {
            accessToken: 'at',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 0,
            refreshToken: 'rt',
          },
          fullProfile: {
            id: '1',
            provider: 'AAP oauth2',
            username: 'ghost',
            displayName: 'ghost',
          },
        },
      };

      const context = {
        findCatalogUser: jest
          .fn()
          .mockRejectedValue(new Error('User not found')),
        issueToken: jest.fn(),
      } satisfies Partial<AuthResolverContext>;

      await expect(resolver(info, context as any)).rejects.toThrow(
        'Sign in failed: User not found in the RH AAP software catalog',
      );
    });

    it('should issue minimal token when user not in catalog and dangerously flag is true', async () => {
      const dangerousConfig = {
        getOptionalConfig: jest.fn().mockReturnValue(undefined),
        getOptionalBoolean: jest.fn().mockReturnValue(true),
      };
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser({
        config: dangerousConfig as any,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {},
        result: {
          session: {
            accessToken: 'at',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 0,
            refreshToken: 'rt',
          },
          fullProfile: {
            id: '1',
            provider: 'AAP oauth2',
            username: 'ghost',
            displayName: 'ghost',
          },
        },
      };

      const context = {
        findCatalogUser: jest
          .fn()
          .mockRejectedValue(new Error('User not found')),
        issueToken: jest.fn().mockResolvedValue({ token: 'ghost-token' }),
      } satisfies Partial<AuthResolverContext>;

      const result = await resolver(info, context as any);
      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/ghost',
          ent: ['user:default/ghost'],
        },
      });
      expect(result).toEqual({ token: 'ghost-token' });
    });
  });

  describe('allowNewAAPUserSignIn', () => {
    it('should sign in existing user without calling createUser', async () => {
      const userProvisioner = makeUserProvisioner();
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'existing@test.com',
          picture: undefined,
          displayName: 'Existing User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: '123',
            provider: 'AAP oauth2',
            username: 'existingUser',
            email: 'existing@test.com',
            displayName: 'Existing User',
          },
        },
      };

      const entity = mockUserEntity('existingUser');
      const context = {
        findCatalogUser: jest.fn().mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'user-token' }),
      } satisfies Partial<AuthResolverContext>;

      const result = await resolver(info, context as any);

      expect(context.findCatalogUser).toHaveBeenCalledWith({
        entityRef: { name: 'existingUser' },
      });
      expect(userProvisioner.createUser).not.toHaveBeenCalled();
      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/existinguser',
          ent: ['user:default/existinguser'],
        },
      });
      expect(result).toEqual({ token: 'user-token' });
    });

    it('should call createUser and sign in when user not in catalog', async () => {
      const userProvisioner = makeUserProvisioner(
        jest.fn().mockResolvedValue(true),
      );
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'newuser@test.com',
          picture: undefined,
          displayName: 'New User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: '456',
            provider: 'AAP oauth2',
            username: 'newUser',
            email: 'newuser@test.com',
            displayName: 'New User',
          },
        },
      };

      const entity = mockUserEntity('newUser');
      const context = {
        findCatalogUser: jest
          .fn()
          .mockRejectedValueOnce(new Error('User not found'))
          .mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'new-user-token' }),
      } satisfies Partial<AuthResolverContext>;

      const result = await resolver(info, context as any);

      expect(userProvisioner.createUser).toHaveBeenCalledWith('newUser', 456);
      expect(context.findCatalogUser).toHaveBeenCalledWith({
        entityRef: { name: 'newUser' },
      });
      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/newuser',
          ent: ['user:default/newuser'],
        },
      });
      expect(result).toEqual({ token: 'new-user-token' });
    });

    it('should fail when username is missing', async () => {
      const userProvisioner = makeUserProvisioner();
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'test@test.com',
          picture: undefined,
          displayName: 'Test User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: '789',
            provider: 'AAP oauth2',
            username: '',
            email: 'test@test.com',
            displayName: 'Test User',
          },
        },
      };

      const context = {} satisfies Partial<AuthResolverContext>;

      let error;
      try {
        await resolver(info, context as any);
      } catch (e: any) {
        error = e;
      }

      expect(error?.message).toBe(
        'Oauth2 user profile does not contain a username or user ID',
      );
    });

    it('should fail when userID is missing', async () => {
      const userProvisioner = makeUserProvisioner();
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'test@test.com',
          picture: undefined,
          displayName: 'Test User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: '',
            provider: 'AAP oauth2',
            username: 'testUser',
            email: 'test@test.com',
            displayName: 'Test User',
          },
        },
      };

      const context = {} satisfies Partial<AuthResolverContext>;

      let error;
      try {
        await resolver(info, context as any);
      } catch (e: any) {
        error = e;
      }

      expect(error?.message).toBe(
        'Oauth2 user profile does not contain a username or user ID',
      );
    });

    it('should propagate error when createUser fails', async () => {
      const userProvisioner = makeUserProvisioner(
        jest.fn().mockRejectedValue(new Error('AAP API error')),
      );
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {},
        result: {
          session: {
            accessToken: 'at',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 0,
            refreshToken: 'rt',
          },
          fullProfile: {
            id: '456',
            provider: 'AAP oauth2',
            username: 'newUser',
            displayName: 'newUser',
          },
        },
      };

      const context = {
        findCatalogUser: jest
          .fn()
          .mockRejectedValue(new Error('User not found')),
        issueToken: jest.fn(),
      } satisfies Partial<AuthResolverContext>;

      await expect(resolver(info, context as any)).rejects.toThrow(
        'AAP API error',
      );
    });

    it('should throw when user still not found after provisioning', async () => {
      // The retry loop has exponential backoff totalling 5000ms — exactly the
      // Jest default timeout. Use fake timers so the delays are instant.
      jest.useFakeTimers();
      try {
        const userProvisioner = makeUserProvisioner(
          jest.fn().mockResolvedValue(true),
        );
        const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
          userProvisioner,
        });
        const resolver = (resolverFactory as any)();

        const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
          profile: {},
          result: {
            session: {
              accessToken: 'at',
              tokenType: 'Bearer',
              scope: 'read',
              expiresInSeconds: 0,
              refreshToken: 'rt',
            },
            fullProfile: {
              id: '456',
              provider: 'AAP oauth2',
              username: 'newUser',
              displayName: 'newUser',
            },
          },
        };

        const context = {
          findCatalogUser: jest
            .fn()
            .mockRejectedValue(new Error('User not found')),
          issueToken: jest.fn(),
        } satisfies Partial<AuthResolverContext>;

        const promise = resolver(info, context as any);
        // Attach the rejection handler BEFORE advancing timers to prevent an
        // unhandled-rejection event when the promise rejects during runAllTimersAsync.
        // eslint-disable-next-line jest/valid-expect
        const assertion = expect(promise).rejects.toThrow(
          'Sign in failed: User newUser not found in catalog after provisioning',
        );
        // Drain all retry-backoff timers so the loop completes instantly.
        await jest.runAllTimersAsync();
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    it('should sign in successfully with userID 0', async () => {
      // id='0' (string) is truthy, so the guard does NOT throw.
      // Number('0') === 0, which is also not NaN, so userID 0 is valid.
      const userProvisioner = makeUserProvisioner();
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {},
        result: {
          session: {
            accessToken: 'at',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 0,
            refreshToken: 'rt',
          },
          fullProfile: {
            id: '0',
            provider: 'AAP oauth2',
            username: 'adminUser',
            displayName: 'adminUser',
          },
        },
      };

      const entity = mockUserEntity('adminUser');
      const context = {
        // User exists — found immediately, createUser not called
        findCatalogUser: jest.fn().mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'admin-token' }),
      } satisfies Partial<AuthResolverContext>;

      const result = await resolver(info, context as any);
      expect(userProvisioner.createUser).not.toHaveBeenCalled();
      expect(result).toEqual({ token: 'admin-token' });
    });

    it('should include aap-admins group for superuser on first login', async () => {
      const userProvisioner = makeUserProvisioner(
        jest.fn().mockResolvedValue(true),
      );
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'super@test.com',
          picture: undefined,
          displayName: 'Super User',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: '999',
            provider: 'AAP oauth2',
            username: 'superUser',
            email: 'super@test.com',
            displayName: 'Super User',
          },
        },
      };

      // Superuser entity with annotation but WITHOUT stitched memberOf relations
      // (simulates the race condition on first login)
      const entity = mockUserEntity('superUser', { isSuperuser: true });
      const context = {
        findCatalogUser: jest
          .fn()
          .mockRejectedValueOnce(new Error('User not found'))
          .mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'superuser-token' }),
      } satisfies Partial<AuthResolverContext>;

      const result = await resolver(info, context as any);

      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/superuser',
          ent: ['user:default/superuser', 'group:default/aap-admins'],
        },
      });
      expect(result).toEqual({ token: 'superuser-token' });
    });

    it('should include stitched group relations in token', async () => {
      const userProvisioner = makeUserProvisioner();
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        userProvisioner,
      });
      const resolver = (resolverFactory as any)();

      const info: SignInInfo<OAuthAuthenticatorResult<PassportProfile>> = {
        profile: {
          email: 'member@test.com',
          picture: undefined,
          displayName: 'Team Member',
        },
        result: {
          session: {
            accessToken: 'accessToken',
            tokenType: 'Bearer',
            scope: 'read',
            expiresInSeconds: 31536000000,
            refreshToken: 'refreshToken',
          },
          fullProfile: {
            id: '100',
            provider: 'AAP oauth2',
            username: 'teamMember',
            email: 'member@test.com',
            displayName: 'Team Member',
          },
        },
      };

      const entity = mockUserEntity('teamMember', {
        memberOfGroups: ['engineering', 'default-org'],
      });
      const context = {
        findCatalogUser: jest.fn().mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'member-token' }),
      } satisfies Partial<AuthResolverContext>;

      await resolver(info, context as any);

      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/teammember',
          ent: [
            'user:default/teammember',
            'group:default/engineering',
            'group:default/default-org',
          ],
        },
      });
    });
  });
});
