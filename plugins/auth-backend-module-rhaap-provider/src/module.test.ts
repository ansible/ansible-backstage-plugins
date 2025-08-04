import { Server } from 'http';
import { setupServer } from 'msw/node';
import {
  mockServices,
  registerMswTestHooks,
  startTestBackend,
} from '@backstage/backend-test-utils';
import request from 'supertest';
import { authModuleRhaapProvider } from './module';
import { http, HttpResponse, passthrough } from 'msw';
import { decodeOAuthState } from '@backstage/plugin-auth-node';
import { exportJWK, generateKeyPair, JWK, SignJWT } from 'jose';
import {
  DEFAULT_HOST,
  ME_RESPONSE_DATA,
  MOCK_CONFIG,
  TOKEN_RESPONSE,
} from './mockData';
import { ansibleServiceRef } from '@ansible/backstage-rhaap-common';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import authBackend from '@backstage/plugin-auth-backend';

const mockAnsibleService = {
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

describe('authModuleRHAAPProvider', () => {
  let backstageServer: Server;
  let appUrl: string;
  let publicKey: JWK;

  const handlers = [
    http.get('https://rhaap.test/o/authorize/', ({ request: req }) => {
      const url = new URL(req.url);
      const callbackUrl = new URL(url.searchParams.get('redirect_uri')!);
      callbackUrl.searchParams.set('code', 'authorization_code');
      callbackUrl.searchParams.set('state', url.searchParams.get('state')!);
      callbackUrl.searchParams.set('scope', 'test-scope');
      return HttpResponse.redirect(callbackUrl);
    }),
  ];

  const mswServer = setupServer(...handlers);
  mswServer.listen();
  registerMswTestHooks(mswServer);

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    const privateKey = await exportJWK(keyPair.privateKey);
    publicKey = await exportJWK(keyPair.publicKey);
    publicKey.alg = privateKey.alg = 'RS256';

    await new SignJWT({
      sub: 'test',
      iss: 'https://rhaap.test',
      iat: Date.now(),
      aud: 'clientId',
      exp: Date.now() + 10000,
    })
      .setProtectedHeader({ alg: privateKey.alg, kid: privateKey.kid })
      .sign(keyPair.privateKey);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const backend = await startTestBackend({
      features: [
        authModuleRhaapProvider,
        authBackend,
        mockServices.rootConfig.factory(MOCK_CONFIG),
        createServiceFactory({
          service: ansibleServiceRef,
          deps: {},
          factory: async () => mockAnsibleService as any,
        }),
      ],
    });
    backstageServer = backend.server;
    const port = backend.server.port();
    appUrl = `http://localhost:${port}`;
    mswServer.use(http.all(`http://*:${port}/*`, () => passthrough()));
  }, 20000);

  afterEach(() => {
    if (backstageServer) {
      backstageServer.close();
    }
  });

  it('should start', async () => {
    const agent = request.agent(backstageServer);
    const startResponse = await agent.get(
      `/api/auth/rhaap/start?env=development`,
    );
    expect(startResponse.status).toEqual(302);

    const nonceCookie = agent.jar.getCookie('rhaap-nonce', {
      domain: 'localhost',
      path: '/api/auth/rhaap/handler',
      script: false,
      secure: false,
    });

    const startUrl = new URL(startResponse.get('location') ?? '');
    expect(startUrl.origin).toBe('https://rhaap.test');
    expect(startUrl.pathname).toBe('/o/authorize/');
    expect(Object.fromEntries(startUrl.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'clientId',
      redirect_uri: `${appUrl}/api/auth/rhaap/handler/frame`,
      state: expect.any(String),
      approval_prompt: 'auto',
    });
    expect(decodeOAuthState(startUrl.searchParams.get('state')!)).toEqual({
      env: 'development',
      nonce: decodeURIComponent(nonceCookie!.value),
      scope: '',
    });
  });

  it('#authenticate exchanges authorization code for a access_token', async () => {
    const agent = request.agent('');
    const startResponse = await agent.get(
      `${appUrl}/api/auth/rhaap/start?env=development`,
    );
    const authorizationResponse = await agent.get(
      startResponse.header.location,
    );
    const handlerResponse = await agent.get(
      authorizationResponse.header.location,
    );
    expect(handlerResponse.text).toContain(
      encodeURIComponent(`"accessToken":"accessToken"`),
    );
  });
});
