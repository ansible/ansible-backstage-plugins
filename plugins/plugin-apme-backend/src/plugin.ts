import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

export const apmePlugin = createBackendPlugin({
  pluginId: 'apme',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
      },
      async init({ logger, config, httpRouter, httpAuth, userInfo }) {
        const gatewayBaseUrl =
          config.getOptionalString('apme.gateway.baseUrl') ??
          'http://localhost:8080';

        logger.info(`APME backend plugin proxying to ${gatewayBaseUrl}`);

        httpRouter.use(
          await createRouter({ logger, gatewayBaseUrl, httpAuth, userInfo }),
        );

        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
