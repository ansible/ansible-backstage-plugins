import { randomBytes, createHash } from 'node:crypto';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import {
  createOAuthAuthenticator,
  PassportOAuthAuthenticatorHelper,
  PassportOAuthDoneCallback,
  PassportProfile,
} from '@backstage/plugin-auth-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import { AuthenticationError } from '@backstage/errors';

const PKCE_COOKIE_NAME = 'rhaap-pkce';
const PKCE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function getPkceCookieOptions(callbackURL: string) {
  const { protocol, pathname } = new URL(callbackURL);
  const path = pathname.endsWith('/frame') ? pathname.slice(0, -6) : pathname;
  return {
    httpOnly: true,
    secure: protocol === 'https:',
    sameSite: 'lax' as const,
    path,
  };
}

function setPkceCookie(
  req: { res?: { cookie?: Function } },
  verifier: string,
  callbackURL: string,
): void {
  const res = req.res;
  if (!res?.cookie) {
    throw new Error(
      'Unable to access response object for PKCE cookie. ' +
        'This may indicate an incompatible Express version.',
    );
  }
  res.cookie(PKCE_COOKIE_NAME, verifier, {
    ...getPkceCookieOptions(callbackURL),
    maxAge: PKCE_COOKIE_MAX_AGE_MS,
  });
}

function readAndClearPkceCookie(
  req: { cookies?: Record<string, string>; res?: { clearCookie?: Function } },
  callbackURL: string,
): string | undefined {
  const verifier = req.cookies?.[PKCE_COOKIE_NAME];
  const res = req.res;
  if (res?.clearCookie) {
    res.clearCookie(PKCE_COOKIE_NAME, getPkceCookieOptions(callbackURL));
  }
  return verifier;
}

/** @public */
export interface AAPAuthenticatorContext {
  helper: PassportOAuthAuthenticatorHelper;
  host: string;
  clientId: string;
  clientSecret: string;
  callbackURL: string;
  checkSSL: boolean;
}

/** @public */
export const aapAuthAuthenticator = (aapService: IAAPService) =>
  createOAuthAuthenticator<AAPAuthenticatorContext, PassportProfile>({
    scopes: {
      persist: true,
    },
    defaultProfileTransform:
      PassportOAuthAuthenticatorHelper.defaultProfileTransform,
    initialize({ callbackUrl, config }) {
      const clientId = config.getString('clientId');
      const clientSecret = config.getString('clientSecret');
      let host = config.getString('host');
      host = host.endsWith('/') ? host.slice(0, -1) : host;
      const callbackURL =
        config.getOptionalString('callbackUrl') ?? callbackUrl;
      const checkSSL = config.getBoolean('checkSSL') ?? true;

      const helper = PassportOAuthAuthenticatorHelper.from(
        new OAuth2Strategy(
          {
            clientID: clientId,
            clientSecret: clientSecret,
            callbackURL: callbackURL,
            authorizationURL: `${host}/o/authorize/`,
            tokenURL: `${host}/o/token/`,
            skipUserProfile: true,
            passReqToCallback: false,
          },
          (
            accessToken: any,
            refreshToken: any,
            params: any,
            fullProfile: PassportProfile,
            done: PassportOAuthDoneCallback,
          ) => {
            done(
              undefined,
              { fullProfile, params, accessToken },
              { refreshToken },
            );
          },
        ),
      );
      return { helper, host, clientId, clientSecret, callbackURL, checkSSL };
    },
    async start(input, { helper, callbackURL }) {
      const { verifier, challenge } = generatePKCE();
      setPkceCookie(input.req, verifier, callbackURL);

      const start = await helper.start(input, {
        accessType: 'offline',
        prompt: 'auto',
        approval_prompt: 'auto',
      });
      start.url += `&approval_prompt=auto&code_challenge=${challenge}&code_challenge_method=S256`;
      return start;
    },

    async authenticate(
      input,
      { host, clientId, clientSecret, callbackURL, checkSSL },
    ) {
      const oauthError = input.req.query.error as string | undefined;
      const oauthErrorDescription = input.req.query.error_description as
        string | undefined;

      if (oauthError) {
        const errorMessage = oauthErrorDescription
          ? `AAP OAuth error (${oauthError}): ${oauthErrorDescription}`
          : `AAP OAuth error: ${oauthError}`;
        throw new AuthenticationError(errorMessage);
      }

      if (!input.req.query.code) {
        throw new AuthenticationError(
          'OAuth callback is missing both authorization code and error parameters.',
        );
      }

      const codeVerifier = readAndClearPkceCookie(input.req, callbackURL);
      if (!codeVerifier) {
        throw new Error(
          'PKCE verifier cookie not found. The login session may have expired ' +
            'or cookies may be blocked by the browser. Please try logging in again.',
        );
      }

      const result = await aapService.rhAAPAuthenticate({
        host: host,
        checkSSL: checkSSL,
        clientId: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackURL,
        code: input.req.query.code as string,
        codeVerifier,
      });
      const fullProfile = await aapService.fetchProfile(
        result.session.accessToken,
      );
      return { ...result, fullProfile };
    },

    async refresh(
      input,
      { host, clientId, clientSecret, callbackURL, checkSSL },
    ) {
      const result = await aapService.rhAAPAuthenticate({
        host: host,
        checkSSL: checkSSL,
        clientId: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackURL,
        refreshToken: input.refreshToken,
      });

      // Validate AAP session: if the user has been logged out of AAP
      // (token revoked, user deactivated), fetchProfile will fail with
      // a 401 from /api/gateway/v1/me/ — triggering Portal logout.
      let fullProfile;
      try {
        fullProfile = await aapService.fetchProfile(result.session.accessToken);
      } catch (error) {
        if (error instanceof AuthenticationError) {
          throw new AuthenticationError(
            'AAP session is no longer valid. The user may have been logged out ' +
              'of AAP or the token was revoked. Portal session will be terminated.',
          );
        }
        throw error;
      }
      return { ...result, fullProfile };
    },

    async logout(input, { clientId, clientSecret }) {
      const token = input.refreshToken ?? input.accessToken;
      if (token) {
        await aapService.rhAAPRevokeToken({
          clientId,
          clientSecret,
          token,
        });
      }
    },
  });
