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

const PKCE_TTL_MS = 10 * 60 * 1000;
const PKCE_MAX_ENTRIES = 10_000;
const pkceStore = new Map<string, { verifier: string; createdAt: number }>();

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

function cleanExpiredPKCE(): void {
  const now = Date.now();
  for (const [key, entry] of pkceStore) {
    if (now - entry.createdAt > PKCE_TTL_MS) {
      pkceStore.delete(key);
    }
  }
  while (pkceStore.size > PKCE_MAX_ENTRIES) {
    const oldest = pkceStore.keys().next().value;
    if (oldest) pkceStore.delete(oldest);
  }
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
    async start(input, { helper }) {
      const { verifier, challenge } = generatePKCE();
      cleanExpiredPKCE();
      pkceStore.set(input.state, {
        verifier,
        createdAt: Date.now(),
      });

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
      const state = input.req.query.state as string | undefined;
      if (!state) {
        throw new Error(
          'OAuth state parameter missing from callback request.',
        );
      }
      const pkceEntry = pkceStore.get(state);
      if (!pkceEntry) {
        throw new Error(
          'PKCE verifier not found for OAuth state. The login session may have expired or the server may have restarted. Please try logging in again.',
        );
      }
      pkceStore.delete(state);

      const result = await aapService.rhAAPAuthenticate({
        host: host,
        checkSSL: checkSSL,
        clientId: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackURL,
        code: input.req.query.code as string,
        codeVerifier: pkceEntry.verifier,
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
