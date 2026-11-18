import type {
  AuthService,
  DiscoveryService,
  HttpAuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import express from 'express';
import { getCollections } from './utils';

export function createCollectionsAutocompleteRouter(options: {
  auth: AuthService;
  discovery: DiscoveryService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
}): express.Router {
  const router = express.Router();
  router.get('/collections', async (request, response, next) => {
    try {
      await options.httpAuth.credentials(request as any, {
        allow: ['user'],
      });
      const identityToken = request
        .get('authorization')
        ?.match(/^Bearer\s+(\S+)$/i)?.[1];
      const result = await getCollections({
        auth: options.auth,
        discovery: options.discovery,
        logger: options.logger,
        identityToken,
        searchQuery:
          typeof request.query.searchQuery === 'string'
            ? request.query.searchQuery
            : undefined,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
