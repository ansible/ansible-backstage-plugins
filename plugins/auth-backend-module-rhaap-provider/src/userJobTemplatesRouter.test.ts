import { readRhaapRefreshToken } from './readRefreshToken';
import { readRhaapProviderConfig } from './rhaapProviderConfig';
import { createUserJobTemplatesRouter } from './userJobTemplatesRouter';
import { MOCK_CONFIG } from './mockData';
import { ConfigReader } from '@backstage/config';
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
});
