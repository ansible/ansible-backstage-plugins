export const DEFAULT_HOST = 'https://rhaap.test';
export const ACCESS_TOKEN = 'accessToken';
export const TOKEN_TYPE = 'Bearer';
export const SCOPE = 'scope';
export const EXPIRES_IN_SECONDS = 3600;
export const REFRESH_TOKEN = 'refreshToken';
export const CHECK_SSL = false;
export const CLIENT_ID = 'clientId';
export const CLIENT_SECRET = 'clientSecret';
export const MOCK_CONFIG = {
  data: {
    app: { baseUrl: 'http://localhost' },
    backend: { baseUrl: 'http://localhost:7007' },
    enableExperimentalRedirectFlow: true,
    auth: {
      session: { secret: 'test' },
      providers: {
        rhaap: {
          development: {
            host: DEFAULT_HOST,
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            checkSSL: false,
          },
        },
      },
    },
  },
};

export const TOKEN_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      access_token: ACCESS_TOKEN,
      token_type: TOKEN_TYPE,
      scope: SCOPE,
      expires_in: EXPIRES_IN_SECONDS,
      refresh_token: REFRESH_TOKEN,
    }),
};

export const ME_RESPONSE_DATA = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          email: 'someEmail@domain.com',
          username: 'userName',
          first_name: 'userFirstName',
          last_name: 'userLastName',
        },
      ],
    }),
};
