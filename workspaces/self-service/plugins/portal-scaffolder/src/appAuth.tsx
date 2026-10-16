import {
  ApiBlueprint,
  createFrontendModule,
  type FrontendModule,
} from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { compatWrapper } from '@backstage/core-compat-api';
import { AapAuthApi } from './apis';

/** The sign-in input is app-internal: a Portal plugin cannot attach to it. */
const appAuth: FrontendModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    ApiBlueprint.make({
      name: 'rhaap-auth',
      params: define => define(AapAuthApi),
    }),
    SignInPageBlueprint.make({
      name: 'rhaap',
      params: {
        loader: async () => {
          const { SignInPage } = await import('./components/SignInPage');
          return props => compatWrapper(<SignInPage {...props} />);
        },
      },
    }),
  ],
});
export default appAuth;
