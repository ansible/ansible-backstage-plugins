import { readRhaapRefreshToken } from './readRefreshToken';
import { readRhaapProviderConfig } from './rhaapProviderConfig';
import { createUserJobTemplatesRouter } from './userJobTemplatesRouter';
import { MOCK_CONFIG } from './mockData';
import { ConfigReader } from '@backstage/config';
import { AuthenticationError, InputError } from '@backstage/errors';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

describe('readRhaapRefreshToken', () => {
  it.each([
    [
      'a single refresh token cookie header',
      { headers: { cookie: 'rhaap-refresh-token=token-value' } },
      'token-value',
    ],
    [
      'chunked refresh token cookies in the Cookie header',
      {
        headers: {
          cookie:
            'rhaap-refresh-token-0=part-one; rhaap-refresh-token-1=part-two',
        },
      },
      'part-onepart-two',
    ],
    [
      'a single refresh token in req.cookies',
      { cookies: { 'rhaap-refresh-token': 'token-value' } },
      'token-value',
    ],
    [
      'chunked refresh token cookies in req.cookies',
      {
        cookies: {
          'rhaap-refresh-token-0': 'part-one',
          'rhaap-refresh-token-1': 'part-two',
        },
      },
      'part-onepart-two',
    ],
  ])('reads %s', (_description, req, expected) => {
    expect(readRhaapRefreshToken(req as any)).toBe(expected);
  });

  it('returns undefined when no refresh token cookie is present', () => {
    expect(readRhaapRefreshToken({ headers: {} } as any)).toBeUndefined();
  });

  it('ignores malformed cookie header parts', () => {
    expect(
      readRhaapRefreshToken({
        headers: { cookie: 'invalid; rhaap-refresh-token=token-value' },
      } as any),
    ).toBe('token-value');
  });

  it('returns undefined when a chunked refresh token part is not a string', () => {
    expect(
      readRhaapRefreshToken({
        cookies: {
          'rhaap-refresh-token-0': 'part-one',
          'rhaap-refresh-token-1': 123,
        },
      } as any),
    ).toBeUndefined();
  });

  it('merges parsed cookie headers with req.cookies', () => {
    expect(
      readRhaapRefreshToken({
        headers: { cookie: 'other=value' },
        cookies: { 'rhaap-refresh-token': 'from-req-cookies' },
      } as any),
    ).toBe('from-req-cookies');
  });

  it('returns undefined when the refresh token cookie is not a string', () => {
    expect(
      readRhaapRefreshToken({
        cookies: { 'rhaap-refresh-token': 123 },
      } as any),
    ).toBeUndefined();
  });
});

describe('readRhaapProviderConfig', () => {
  it('reads provider config from auth.providers.rhaap.development', () => {
    const config = new ConfigReader(MOCK_CONFIG.data);
    const result = readRhaapProviderConfig(config, 'http://localhost:7007');
    expect(result.host).toBe('https://rhaap.test');
    expect(result.clientId).toBe('clientId');
    expect(result.callbackURL).toBe(
      'http://localhost:7007/api/auth/rhaap/handler/frame',
    );
    expect(result.checkSSL).toBe(false);
  });

  it('trims a trailing slash from the host and honors callbackUrl override', () => {
    const config = new ConfigReader({
      auth: {
        providers: {
          rhaap: {
            development: {
              host: 'https://rhaap.test/',
              clientId: 'clientId',
              clientSecret: 'clientSecret',
              callbackUrl:
                'https://portal.example.com/api/auth/rhaap/handler/frame',
              checkSSL: true,
            },
          },
        },
      },
    });

    const result = readRhaapProviderConfig(config, 'http://localhost:7007');
    expect(result.host).toBe('https://rhaap.test');
    expect(result.callbackURL).toBe(
      'https://portal.example.com/api/auth/rhaap/handler/frame',
    );
    expect(result.checkSSL).toBe(true);
  });

  it('reads production provider config when auth.environment is set', () => {
    const config = new ConfigReader({
      auth: {
        environment: 'production',
        providers: {
          rhaap: {
            production: {
              host: 'https://rhaap.prod.test',
              clientId: 'prod-client',
              clientSecret: 'prod-secret',
            },
          },
        },
      },
    });

    const result = readRhaapProviderConfig(config, 'http://localhost:7007');
    expect(result.host).toBe('https://rhaap.prod.test');
    expect(result.clientId).toBe('prod-client');
    expect(result.checkSSL).toBe(true);
  });
});

describe('createUserJobTemplatesRouter', () => {
  const mockConfig = new ConfigReader(MOCK_CONFIG.data);

  const mockAnsibleService = {
    setLogger: jest.fn(),
    rhAAPAuthenticate: jest.fn().mockResolvedValue({
      session: { accessToken: 'aap-access-token' },
    }),
    getResourceData: jest.fn().mockResolvedValue({
      results: [{ id: 1, name: 'Template 1' }],
    }),
  };

  const mockHttpAuth = {
    credentials: jest.fn().mockResolvedValue({}),
  };

  const createTestApp = () => {
    const router = createUserJobTemplatesRouter({
      logger: { warn: jest.fn(), info: jest.fn() } as any,
      config: mockConfig,
      httpAuth: mockHttpAuth as any,
      ansibleService: mockAnsibleService as any,
      authBaseUrl: 'http://localhost:7007',
    });
    const app = express();
    app.use(cookieParser());
    app.use(router);
    return app;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'an access token header',
      sendRequest: (app: express.Express) =>
        request(app)
          .get('/rhaap/user-job-templates')
          .set('X-RHAAP-Access-Token', 'header-access-token'),
      assertAuth: () => {
        expect(mockAnsibleService.rhAAPAuthenticate).not.toHaveBeenCalled();
        expect(mockAnsibleService.getResourceData).toHaveBeenCalledWith(
          'job_templates',
          'header-access-token',
        );
      },
    },
    {
      description: 'a refresh cookie when auth succeeds',
      sendRequest: (app: express.Express) =>
        request(app)
          .get('/rhaap/user-job-templates')
          .set('Cookie', 'rhaap-refresh-token=test-refresh-token'),
      assertAuth: () => {
        expect(mockAnsibleService.rhAAPAuthenticate).toHaveBeenCalledWith(
          expect.objectContaining({ refreshToken: 'test-refresh-token' }),
        );
      },
    },
  ])(
    'returns job templates when $description is provided',
    async ({ sendRequest, assertAuth }) => {
      const app = createTestApp();
      const response = await sendRequest(app);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        items: [{ id: 1, name: 'Template 1' }],
      });
      assertAuth();
    },
  );

  it('returns 401 when refresh cookie is missing', async () => {
    const app = createTestApp();

    const response = await request(app).get('/rhaap/user-job-templates');
    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/Missing RHAAP session cookie/);
  });

  it('returns 401 when portal authentication fails', async () => {
    mockHttpAuth.credentials.mockRejectedValueOnce(new Error('unauthorized'));
    const app = createTestApp();

    const response = await request(app).get('/rhaap/user-job-templates');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication required');
  });

  it('returns 401 when token refresh fails with an auth error', async () => {
    mockAnsibleService.rhAAPAuthenticate.mockRejectedValueOnce(
      new AuthenticationError('refresh failed'),
    );
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('Cookie', 'rhaap-refresh-token=test-refresh-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('refresh failed');
  });

  it('returns 502 when token refresh fails with a non-auth error', async () => {
    mockAnsibleService.rhAAPAuthenticate.mockRejectedValueOnce(
      new Error('upstream unavailable'),
    );
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('Cookie', 'rhaap-refresh-token=test-refresh-token');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('upstream unavailable');
  });

  it('returns 401 when fetching job templates fails with an auth error', async () => {
    mockAnsibleService.getResourceData.mockRejectedValueOnce(
      new InputError('invalid token'),
    );
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('X-RHAAP-Access-Token', 'header-access-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid token');
  });

  it('falls back to title and id when template name is missing', async () => {
    mockAnsibleService.getResourceData.mockResolvedValueOnce({
      results: [{ id: 42, title: 'Title Template' }, { id: 7 }],
    });
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('X-RHAAP-Access-Token', 'header-access-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        { id: 42, name: 'Title Template' },
        { id: 7, name: '7' },
      ],
    });
  });

  it('treats blank access token headers as missing and uses the refresh cookie', async () => {
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('X-RHAAP-Access-Token', '   ')
      .set('Cookie', 'rhaap-refresh-token=test-refresh-token');

    expect(response.status).toBe(200);
    expect(mockAnsibleService.rhAAPAuthenticate).toHaveBeenCalled();
  });

  it('returns 401 when refresh succeeds without an access token', async () => {
    mockAnsibleService.rhAAPAuthenticate.mockResolvedValueOnce({
      session: { accessToken: '' },
    });
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('Cookie', 'rhaap-refresh-token=test-refresh-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Failed to refresh AAP access token');
  });

  it('returns 401 when token refresh fails with an input error', async () => {
    mockAnsibleService.rhAAPAuthenticate.mockRejectedValueOnce(
      new InputError('invalid refresh token'),
    );
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('Cookie', 'rhaap-refresh-token=test-refresh-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid refresh token');
  });

  it('returns 502 when token refresh throws a non-error value', async () => {
    mockAnsibleService.rhAAPAuthenticate.mockRejectedValueOnce(
      'refresh failed',
    );
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('Cookie', 'rhaap-refresh-token=test-refresh-token');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('Failed to refresh AAP access token');
  });

  it('returns an empty list when AAP returns no results', async () => {
    mockAnsibleService.getResourceData.mockResolvedValueOnce({
      results: null,
    });
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('X-RHAAP-Access-Token', 'header-access-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it('returns 401 when fetching job templates fails with an authentication error', async () => {
    mockAnsibleService.getResourceData.mockRejectedValueOnce(
      new AuthenticationError('token revoked'),
    );
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('X-RHAAP-Access-Token', 'header-access-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('token revoked');
  });

  it('returns 502 when fetching job templates fails with a non-auth error', async () => {
    mockAnsibleService.getResourceData.mockRejectedValueOnce(
      new Error('upstream unavailable'),
    );
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('X-RHAAP-Access-Token', 'header-access-token');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('upstream unavailable');
  });

  it('returns 502 when fetching job templates throws a non-error value', async () => {
    mockAnsibleService.getResourceData.mockRejectedValueOnce('boom');
    const app = createTestApp();

    const response = await request(app)
      .get('/rhaap/user-job-templates')
      .set('X-RHAAP-Access-Token', 'header-access-token');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('Failed to fetch job templates');
  });
});
