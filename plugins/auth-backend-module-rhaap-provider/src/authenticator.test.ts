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

  describe('authenticate PKCE validation', () => {
    const authContext = {
      host: DEFAULT_HOST,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: 'http://localhost',
      checkSSL: CHECK_SSL,
    };

    it('should throw when OAuth state parameter is missing', async () => {
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
          { req: { query: {} } },
          authContext,
        ),
      ).rejects.toThrow('OAuth state parameter missing from callback request.');
    });

    it('should throw when PKCE verifier is not found for state', async () => {
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
          { req: { query: { state: 'unknown-state' } } },
          authContext,
        ),
      ).rejects.toThrow('PKCE verifier not found for OAuth state');
    });

    it('should authenticate successfully with valid PKCE state', async () => {
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
        { state: 'valid-state', scope: '', req: {} },
        ctx,
      );

      const result = await aapAuthAuthenticator.authenticate(
        // @ts-ignore
        { req: { query: { state: 'valid-state', code: 'auth-code' } } },
        authContext,
      );

      expect(mockAAPService.rhAAPAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'auth-code',
          codeVerifier: expect.any(String),
        }),
      );
      expect(result.fullProfile).toBeDefined();
    });

    it('should throw when PKCE verifier has expired', async () => {
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

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await aapAuthAuthenticator.start(
        // @ts-ignore
        { state: 'expired-state', scope: '', req: {} },
        ctx,
      );

      jest.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000);

      await expect(
        aapAuthAuthenticator.authenticate(
          // @ts-ignore
          { req: { query: { state: 'expired-state', code: 'auth-code' } } },
          authContext,
        ),
      ).rejects.toThrow('PKCE verifier has expired');

      jest.restoreAllMocks();
    });
  });

  describe('PKCE store cleanup', () => {
    it('should clean expired entries on next start call', async () => {
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

      const baseTime = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      await aapAuthAuthenticator.start(
        // @ts-ignore
        { state: 'old-state-1', scope: '', req: {} },
        ctx,
      );

      jest.spyOn(Date, 'now').mockReturnValue(baseTime + 10 * 60 * 1000 + 1);

      await aapAuthAuthenticator.start(
        // @ts-ignore
        { state: 'new-state', scope: '', req: {} },
        ctx,
      );

      await expect(
        aapAuthAuthenticator.authenticate(
          // @ts-ignore
          { req: { query: { state: 'old-state-1', code: 'c' } } },
          {
            host: DEFAULT_HOST,
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            callbackURL: 'http://localhost',
            checkSSL: CHECK_SSL,
          },
        ),
      ).rejects.toThrow('PKCE verifier not found');

      jest.restoreAllMocks();
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
