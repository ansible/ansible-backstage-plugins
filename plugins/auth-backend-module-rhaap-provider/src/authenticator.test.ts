import { mockServices } from '@backstage/backend-test-utils';
import { AuthenticationError } from '@backstage/errors';
import { aapAuthAuthenticator as createAuthenticator } from './authenticator';
import {
  CHECK_SSL,
  CLIENT_ID,
  CLIENT_SECRET,
  DEFAULT_HOST,
  ME_RESPONSE_DATA,
  TOKEN_RESPONSE,
} from './mockData';

const mockAAPService = {
  rhAAPAuthenticate: jest.fn().mockResolvedValue({
    session: {
      accessToken: 'accessToken',
      tokenType: 'Bearer',
      scope: 'scope',
      expiresInSeconds: 3600,
      refreshToken: 'refreshToken',
    },
  }),
  fetchProfile: jest.fn().mockResolvedValue({
    provider: 'AAP oauth2',
    username: 'userName',
    email: 'someEmail@domain.com',
    displayName: 'userFirstName userLastName',
  }),
  rhAAPRevokeToken: jest.fn().mockResolvedValue(undefined),
};

jest.mock('undici', () => ({
  ...jest.requireActual('undici'),
  fetch: jest.fn(async (input: any, init: any) => {
    const method = init?.method ?? 'GET';
    if (input === `${DEFAULT_HOST}/o/token/` && method === 'POST') {
      return Promise.resolve(TOKEN_RESPONSE);
    }
    if (input === `${DEFAULT_HOST}/api/gateway/v1/me/` && method === 'GET') {
      return Promise.resolve(ME_RESPONSE_DATA);
    }
    return null;
  }),
}));

describe('authenticator', () => {
  it('authenticator works', async () => {
    const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
    aapAuthAuthenticator.initialize({
      callbackUrl: '',
      config: mockServices.rootConfig({
        data: {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          host: DEFAULT_HOST,
          checkSSL: CHECK_SSL,
          callbackUrl: 'http://localhost',
        },
      }),
    });

    const result = await aapAuthAuthenticator.refresh(
      // @ts-ignore
      { refreshToken: 'oldRefreshToken' },
      {
        host: DEFAULT_HOST,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackURL: 'http://localhost',
        checkSSL: CHECK_SSL,
      },
    );
    expect(result).toEqual({
      session: {
        accessToken: 'accessToken',
        tokenType: 'Bearer',
        scope: 'scope',
        expiresInSeconds: 3600,
        refreshToken: 'refreshToken',
      },
      fullProfile: {
        provider: 'AAP oauth2',
        username: 'userName',
        email: 'someEmail@domain.com',
        displayName: 'userFirstName userLastName',
      },
    });
  });

  it('logout revokes refresh token when available', async () => {
    const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
    aapAuthAuthenticator.initialize({
      callbackUrl: '',
      config: mockServices.rootConfig({
        data: {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          host: DEFAULT_HOST,
          checkSSL: CHECK_SSL,
          callbackUrl: 'http://localhost',
        },
      }),
    });

    await aapAuthAuthenticator.logout!(
      // @ts-ignore
      { refreshToken: 'myRefreshToken', accessToken: 'myAccessToken' },
      {
        host: DEFAULT_HOST,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackURL: 'http://localhost',
        checkSSL: CHECK_SSL,
      },
    );

    expect(mockAAPService.rhAAPRevokeToken).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      token: 'myRefreshToken',
    });
  });

  it('logout revokes access token when no refresh token', async () => {
    const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
    aapAuthAuthenticator.initialize({
      callbackUrl: '',
      config: mockServices.rootConfig({
        data: {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          host: DEFAULT_HOST,
          checkSSL: CHECK_SSL,
          callbackUrl: 'http://localhost',
        },
      }),
    });

    await aapAuthAuthenticator.logout!(
      // @ts-ignore
      { accessToken: 'myAccessToken' },
      {
        host: DEFAULT_HOST,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackURL: 'http://localhost',
        checkSSL: CHECK_SSL,
      },
    );

    expect(mockAAPService.rhAAPRevokeToken).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      token: 'myAccessToken',
    });
  });

  it('logout does nothing when no tokens available', async () => {
    const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
    aapAuthAuthenticator.initialize({
      callbackUrl: '',
      config: mockServices.rootConfig({
        data: {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          host: DEFAULT_HOST,
          checkSSL: CHECK_SSL,
          callbackUrl: 'http://localhost',
        },
      }),
    });

    mockAAPService.rhAAPRevokeToken.mockClear();

    await aapAuthAuthenticator.logout!(
      // @ts-ignore
      {},
      {
        host: DEFAULT_HOST,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackURL: 'http://localhost',
        checkSSL: CHECK_SSL,
      },
    );

    expect(mockAAPService.rhAAPRevokeToken).not.toHaveBeenCalled();
  });

  describe('PKCE cookie-based flow', () => {
    const authContext = {
      host: DEFAULT_HOST,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: 'http://localhost',
      checkSSL: CHECK_SSL,
    } as any;

    it('should set rhaap-pkce cookie during start', async () => {
      const mockCookie = jest.fn();
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      const ctx = aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      await aapAuthAuthenticator.start(
        // @ts-ignore
        {
          state: 'test-state',
          scope: '',
          req: { res: { cookie: mockCookie } } as any,
        },
        ctx,
      );

      expect(mockCookie).toHaveBeenCalledWith(
        'rhaap-pkce',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/api/auth/rhaap/handler',
        }),
      );
      const verifier = mockCookie.mock.calls[0][1];
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('should authenticate using verifier from rhaap-pkce cookie', async () => {
      const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      const result = await aapAuthAuthenticator.authenticate(
        // @ts-ignore
        {
          req: {
            cookies: { 'rhaap-pkce': testVerifier },
            query: { state: 'valid-state', code: 'auth-code' },
            res: { clearCookie: jest.fn() },
          } as any,
        },
        authContext,
      );

      expect(mockAAPService.rhAAPAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'auth-code',
          codeVerifier: testVerifier,
        }),
      );
      expect(result.fullProfile).toBeDefined();
    });

    it('should clear rhaap-pkce cookie after reading', async () => {
      const mockClearCookie = jest.fn();
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      await aapAuthAuthenticator.authenticate(
        // @ts-ignore
        {
          req: {
            cookies: { 'rhaap-pkce': 'test-verifier' },
            query: { state: 'valid-state', code: 'auth-code' },
            res: { clearCookie: mockClearCookie },
          } as any,
        },
        authContext,
      );

      expect(mockClearCookie).toHaveBeenCalledWith(
        'rhaap-pkce',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/auth/rhaap/handler',
        }),
      );
    });

    it('should throw when rhaap-pkce cookie is missing', async () => {
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      await expect(
        aapAuthAuthenticator.authenticate(
          // @ts-ignore
          {
            req: {
              cookies: {},
              query: { state: 'valid-state', code: 'auth-code' },
              res: { clearCookie: jest.fn() },
            } as any,
          },
          authContext,
        ),
      ).rejects.toThrow('PKCE verifier cookie not found');
    });

    it('should throw when cookies are not parsed', async () => {
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      await expect(
        aapAuthAuthenticator.authenticate(
          // @ts-ignore
          {
            req: {
              query: { state: 'valid-state', code: 'auth-code' },
              res: { clearCookie: jest.fn() },
            } as any,
          },
          authContext,
        ),
      ).rejects.toThrow('PKCE verifier cookie not found');
    });

    it('should throw if response object is not accessible during start', async () => {
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      const ctx = aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      await expect(
        aapAuthAuthenticator.start(
          // @ts-ignore
          { state: 'test-state', scope: '', req: {} },
          ctx,
        ),
      ).rejects.toThrow('Unable to access response object for PKCE cookie');
    });

    it('should set secure flag when callback URL uses https', async () => {
      const mockCookie = jest.fn();
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      const ctx = aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl:
              'https://production.example.com/auth/rhaap/handler/frame',
          },
        }),
      });

      await aapAuthAuthenticator.start(
        // @ts-ignore
        {
          state: 'test-state',
          scope: '',
          req: { res: { cookie: mockCookie } } as any,
        },
        ctx,
      );

      expect(mockCookie).toHaveBeenCalledWith(
        'rhaap-pkce',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/auth/rhaap/handler',
        }),
      );
    });

    it('should derive cookie path from callbackURL with path prefix', async () => {
      const mockCookie = jest.fn();
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      const ctx = aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl:
              'http://localhost/custom/prefix/api/auth/rhaap/handler/frame',
          },
        }),
      });

      await aapAuthAuthenticator.start(
        // @ts-ignore
        {
          state: 'test-state',
          scope: '',
          req: { res: { cookie: mockCookie } } as any,
        },
        ctx,
      );

      expect(mockCookie).toHaveBeenCalledWith(
        'rhaap-pkce',
        expect.any(String),
        expect.objectContaining({
          path: '/custom/prefix/api/auth/rhaap/handler',
        }),
      );
    });

    it('should authenticate when clearCookie is not available (best-effort cleanup)', async () => {
      const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      const result = await aapAuthAuthenticator.authenticate(
        // @ts-ignore
        {
          req: {
            cookies: { 'rhaap-pkce': testVerifier },
            query: { state: 'valid-state', code: 'auth-code' },
            res: {},
          } as any,
        },
        authContext,
      );

      expect(mockAAPService.rhAAPAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'auth-code',
          codeVerifier: testVerifier,
        }),
      );
      expect(result.fullProfile).toBeDefined();
    });

    it('should generate valid PKCE challenge in authorization URL', async () => {
      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      const ctx = aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      const result = await aapAuthAuthenticator.start(
        // @ts-ignore
        {
          state: 'test-state',
          scope: '',
          req: { res: { cookie: jest.fn() } } as any,
        },
        ctx,
      );

      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('code_challenge_method=S256');
      expect(result.url).toContain('approval_prompt=auto');
      const challengeMatch = result.url.match(
        /code_challenge=([A-Za-z0-9_-]+)/,
      );
      expect(challengeMatch).toBeTruthy();
      expect(challengeMatch![1]).toHaveLength(43);
    });
  });

  describe('logout sync', () => {
    const authContext = {
      host: DEFAULT_HOST,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: 'http://localhost',
      checkSSL: CHECK_SSL,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockAAPService.rhAAPAuthenticate.mockResolvedValue({
        session: {
          accessToken: 'accessToken',
          tokenType: 'Bearer',
          scope: 'scope',
          expiresInSeconds: 3600,
          refreshToken: 'refreshToken',
        },
      });
    });

    it('should throw AuthenticationError when fetchProfile fails with 401', async () => {
      mockAAPService.fetchProfile.mockRejectedValue(
        new AuthenticationError('Unauthorized'),
      );

      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      await expect(
        aapAuthAuthenticator.refresh(
          // @ts-ignore
          { refreshToken: 'oldRefreshToken' },
          authContext,
        ),
      ).rejects.toThrow(AuthenticationError);

      await expect(
        aapAuthAuthenticator.refresh(
          // @ts-ignore
          { refreshToken: 'oldRefreshToken' },
          authContext,
        ),
      ).rejects.toThrow('AAP session is no longer valid');
    });

    it('should re-throw non-authentication errors from fetchProfile', async () => {
      mockAAPService.fetchProfile.mockRejectedValue(
        new Error('Network timeout'),
      );

      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      await expect(
        aapAuthAuthenticator.refresh(
          // @ts-ignore
          { refreshToken: 'oldRefreshToken' },
          authContext,
        ),
      ).rejects.toThrow('Network timeout');

      // Should NOT be an AuthenticationError
      await expect(
        aapAuthAuthenticator.refresh(
          // @ts-ignore
          { refreshToken: 'oldRefreshToken' },
          authContext,
        ),
      ).rejects.not.toThrow(AuthenticationError);
    });

    it('should succeed when fetchProfile returns valid profile after refresh', async () => {
      mockAAPService.fetchProfile.mockResolvedValue({
        provider: 'AAP oauth2',
        username: 'userName',
        email: 'someEmail@domain.com',
        displayName: 'userFirstName userLastName',
      });

      const aapAuthAuthenticator = createAuthenticator(mockAAPService as any);
      aapAuthAuthenticator.initialize({
        callbackUrl: '',
        config: mockServices.rootConfig({
          data: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            host: DEFAULT_HOST,
            checkSSL: CHECK_SSL,
            callbackUrl: 'http://localhost',
          },
        }),
      });

      const result = await aapAuthAuthenticator.refresh(
        // @ts-ignore
        { refreshToken: 'oldRefreshToken' },
        authContext,
      );

      expect(result.fullProfile).toEqual({
        provider: 'AAP oauth2',
        username: 'userName',
        email: 'someEmail@domain.com',
        displayName: 'userFirstName userLastName',
      });
      expect(result.session.accessToken).toBe('accessToken');
    });
  });
});
