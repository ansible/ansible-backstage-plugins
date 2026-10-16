import { createApp } from '@backstage/frontend-defaults';
import {
  createFrontendModule,
  type FrontendFeature,
} from '@backstage/frontend-plugin-api';
import { convertLegacyAppOptions } from '@backstage/core-compat-api';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import { compatWrapper } from '@backstage/core-compat-api';
import { SignInPage } from '@backstage/core-components';
import { getThemes } from '@red-hat-developer-hub/backstage-plugin-theme';
import portalPlugin from '@ansible/portal-core/alpha';
import portalNavigation from '@ansible/portal-core/app-nav';
import apmePlugin from '@ansible/plugin-backstage-apme/alpha';
import portalScaffolderPlugin from '@ansible/portal-scaffolder/alpha';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import catalogImportPlugin from '@backstage/plugin-catalog-import/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import rbacPlugin from '@backstage-community/plugin-rbac/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import { GlobalHeader } from './components/GlobalHeader/GlobalHeader';
import { baseApis } from './baseApis';
import { providers } from './identityProviders';

/** Additive NFS app: no legacy APME entry point or registration side effects. */
export const portalNfsFeatures: FrontendFeature[] = [
  convertLegacyAppOptions({
    apis: baseApis.filter(factory => factory.api.id !== 'portal.operations'),
    themes: getThemes(),
    components: {
      SignInPage: props => (
        <SignInPage
          {...props}
          align="center"
          title="Select a sign-in method"
          auto
          providers={['guest', ...providers]}
        />
      ),
    },
  }),
  catalogPlugin,
  catalogImportPlugin,
  scaffolderPlugin,
  rbacPlugin,
  userSettingsPlugin,
  searchPlugin,
  portalPlugin,
  portalNavigation,
  createFrontendModule({
    pluginId: 'app',
    extensions: [
      AppRootWrapperBlueprint.make({
        name: 'portal-shell',
        params: {
          component: ({ children }) => (
            <>
              {compatWrapper(<GlobalHeader />)}
              {children}
            </>
          ),
        },
      }),
    ],
  }),
  portalScaffolderPlugin,
  apmePlugin,
];

export default createApp({ features: portalNfsFeatures }).createRoot();
