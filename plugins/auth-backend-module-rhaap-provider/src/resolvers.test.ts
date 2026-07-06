import {
  AuthResolverContext,
  OAuthAuthenticatorResult,
  PassportProfile,
  SignInInfo,
} from '@backstage/plugin-auth-node';
import { AAPAuthSignInResolvers } from './resolvers';

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

global.fetch = jest.fn();

const mockDiscovery = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockAuth = {
  getOwnServiceCredentials: jest
    .fn()
    .mockResolvedValue({ principal: { type: 'service' } }),
  getPluginRequestToken: jest
    .fn()
    .mockResolvedValue({ token: 'mock-service-token' }),
};

describe('resolvers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock setTimeout to avoid actual delays in tests
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback: any, _delay?: number) => {
        // Immediately call the callback to avoid delays in tests
        if (typeof callback === 'function') {
          callback();
        }
        return 1 as any; // Return a fake timer ID
      });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('User created successfully'),
    });
    mockDiscovery.getBaseUrl.mockResolvedValue(
      'http://localhost:7007/api/catalog',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('usernameMatchingUser', () => {
    it('usernameMatchingUser works', async () => {
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser;
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

    it('usernameMatchingUser should include aap-admins for superuser', async () => {
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser;
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

    it('usernameMatchingUser should fail', async () => {
      const resolverFactory = AAPAuthSignInResolvers.usernameMatchingUser;
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
  });

  describe('allowNewAAPUserSignIn', () => {
    it('should sign in existing user without creating new user', async () => {
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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
      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/existinguser',
          ent: ['user:default/existinguser'],
        },
      });
      expect(result).toEqual({ token: 'user-token' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should create new user when not found in catalog and then sign in', async () => {
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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

      expect(context.findCatalogUser).toHaveBeenCalledWith({
        entityRef: { name: 'newUser' },
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/aap/create_user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-service-token',
          },
          body: JSON.stringify({ username: 'newUser', userID: 456 }),
        },
      );
      expect(context.issueToken).toHaveBeenCalledWith({
        claims: {
          sub: 'user:default/newuser',
          ent: ['user:default/newuser'],
        },
      });
      expect(result).toEqual({ token: 'new-user-token' });
    });

    it('should fail when username is missing', async () => {
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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

    it('should handle user creation failure', async () => {
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
      });
      const resolver = (resolverFactory as any)();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Failed to create user'),
      });

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

      const context = {
        findCatalogUser: jest
          .fn()
          .mockRejectedValue(new Error('User not found')),
        issueToken: jest.fn(),
      } satisfies Partial<AuthResolverContext>;

      let error;
      try {
        await resolver(info, context as any);
      } catch (e: any) {
        error = e;
      }

      expect(error?.message).toContain('Failed to create user');
    });

    it('should handle sign-in failure after user creation', async () => {
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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

      const context = {
        findCatalogUser: jest
          .fn()
          .mockRejectedValue(new Error('User not found')),
        issueToken: jest.fn(),
      } satisfies Partial<AuthResolverContext>;

      let error;
      try {
        await resolver(info, context as any);
      } catch (e: any) {
        error = e;
      }

      expect(error?.message).toContain(
        'Sign in failed: User newUser not found in the RH AAP catalog after creation attempt',
      );
    });

    it('should handle zero as valid userID', async () => {
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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
            id: '0',
            provider: 'AAP oauth2',
            username: 'adminUser',
            email: 'admin@test.com',
            displayName: 'Admin User',
          },
        },
      };

      const entity = mockUserEntity('adminUser');
      const context = {
        findCatalogUser: jest.fn().mockResolvedValue({ entity }),
        issueToken: jest.fn().mockResolvedValue({ token: 'admin-token' }),
      } satisfies Partial<AuthResolverContext>;

      const result = await resolver(info, context as any);

      expect(context.findCatalogUser).toHaveBeenCalledWith({
        entityRef: { name: 'adminUser' },
      });
      expect(result).toEqual({ token: 'admin-token' });
    });

    it('should include aap-admins group for superuser on first login', async () => {
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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
      const resolverFactory = AAPAuthSignInResolvers.allowNewAAPUserSignIn({
        discovery: mockDiscovery as any,
        auth: mockAuth as any,
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
