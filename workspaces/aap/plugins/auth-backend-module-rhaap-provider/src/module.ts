import {
  createBackendModule,
  coreServices,
} from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import {
  ansibleServiceRef,
  userProvisionerRef,
} from '@ansible/backstage-rhaap-common';
import { AAPAuthSignInResolvers } from './resolvers';
import { aapAuthAuthenticator } from './authenticator';
import { createUserJobTemplatesRouter } from './userJobTemplatesRouter';

export const authModuleRhaapProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'rhaap-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        providers: authProvidersExtensionPoint,
        ansibleService: ansibleServiceRef,
        userProvisioner: userProvisionerRef,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        logger: coreServices.logger,
      },
      async init({
        providers,
        ansibleService,
        userProvisioner,
        config,
        httpRouter,
        httpAuth,
        logger,
      }) {
        providers.registerProvider({
          providerId: 'rhaap',
          factory: createOAuthProviderFactory({
            authenticator: aapAuthAuthenticator(ansibleService),
            signInResolverFactories: {
              usernameMatchingUser:
                AAPAuthSignInResolvers.createUsernameMatchingUser(config),
              allowNewAAPUserSignIn:
                AAPAuthSignInResolvers.allowNewAAPUserSignIn({
                  userProvisioner,
                  config,
                }),
            },
          }),
        });

        const authBaseUrl = config.getString('backend.baseUrl');
        const userJobTemplatesRouter = createUserJobTemplatesRouter({
          logger,
          config,
          httpAuth,
          ansibleService,
          authBaseUrl,
        });

        httpRouter.use(userJobTemplatesRouter as any);
        httpRouter.addAuthPolicy({
          path: '/rhaap/user-job-templates',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
