import express from 'express';
import Router from 'express-promise-router';
import cookieParser from 'cookie-parser';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { AuthenticationError, InputError } from '@backstage/errors';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import { readRhaapRefreshToken } from './readRefreshToken';
import { readRhaapProviderConfig } from './rhaapProviderConfig';

export function createUserJobTemplatesRouter(options: {
  logger: LoggerService;
  config: Config;
  httpAuth: HttpAuthService;
  ansibleService: IAAPService;
  authBaseUrl: string;
}): express.Router {
  const { logger, config, httpAuth, ansibleService, authBaseUrl } = options;
  const router = Router();
  router.use(cookieParser());

  router.get('/rhaap/user-job-templates', async (req, res) => {
    try {
      await httpAuth.credentials(req as any, { allow: ['user'] });
    } catch {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const headerToken = req.headers['x-rhaap-access-token'];
    let accessToken =
      typeof headerToken === 'string' && headerToken.trim().length > 0
        ? headerToken.trim()
        : undefined;

    if (!accessToken) {
      const refreshToken = readRhaapRefreshToken(req);
      if (!refreshToken) {
        res.status(401).json({ error: 'Missing RHAAP session cookie' });
        return;
      }

      const providerConfig = readRhaapProviderConfig(config, authBaseUrl);

      try {
        const authResult = await ansibleService.rhAAPAuthenticate({
          host: providerConfig.host,
          checkSSL: providerConfig.checkSSL,
          clientId: providerConfig.clientId,
          clientSecret: providerConfig.clientSecret,
          callbackURL: providerConfig.callbackURL,
          refreshToken,
        });

        accessToken = authResult.session.accessToken;
        if (!accessToken) {
          throw new AuthenticationError('Failed to refresh AAP access token');
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to refresh AAP access token';
        logger.warn(`user-job-templates token refresh failed: ${message}`);
        if (
          error instanceof InputError ||
          error instanceof AuthenticationError
        ) {
          res.status(401).json({ error: message });
          return;
        }
        res.status(502).json({ error: message });
        return;
      }
    }

    try {
      ansibleService.setLogger(logger);
      const { results } = await ansibleService.getResourceData(
        'job_templates',
        accessToken,
      );

      const items = (results ?? []).map(
        (result: { id: number; name?: string; title?: string }) => ({
          id: result.id,
          name: result.name ?? result.title ?? String(result.id),
        }),
      );

      res.status(200).json({ items });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to fetch job templates';
      logger.warn(`user-job-templates failed: ${message}`);
      if (error instanceof InputError || error instanceof AuthenticationError) {
        res.status(401).json({ error: message });
        return;
      }
      res.status(502).json({ error: message });
    }
  });

  return router;
}
