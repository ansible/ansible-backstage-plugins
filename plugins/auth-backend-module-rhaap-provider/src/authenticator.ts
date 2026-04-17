import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import {
  createOAuthAuthenticator,
  PassportOAuthAuthenticatorHelper,
  PassportOAuthDoneCallback,
  PassportProfile,
} from '@backstage/plugin-auth-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';

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
      host = host.slice(-1) === '/' ? host.slice(0, -1) : host;
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
      const start = await helper.start(input, {
        accessType: 'offline',
        prompt: 'auto',
        approval_prompt: 'auto',
      });
      start.url += '&approval_prompt=auto';
      return start;
    },

    async authenticate(
      input,
      { host, clientId, clientSecret, callbackURL, checkSSL },
    ) {
      const result = await aapService.rhAAPAuthenticate({
        host: host,
        checkSSL: checkSSL,
        clientId: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackURL,
        code: input.req.query.code as string,
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

      const fullProfile = await aapService.fetchProfile(
        result.session.accessToken,
      );
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
