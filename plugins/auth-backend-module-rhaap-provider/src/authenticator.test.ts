import { mockServices } from '@backstage/backend-test-utils';
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
});
