import { createApp } from '@backstage/frontend-defaults';
import {
  createFrontendModule,
  type FrontendFeature,
  type FrontendFeatureLoader,
} from '@backstage/frontend-plugin-api';
import { convertLegacyAppOptions } from '@backstage/core-compat-api';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import { getThemes } from '@red-hat-developer-hub/backstage-plugin-theme';
import portalPlugin from '@ansible/portal-core/alpha';
import portalNavigation from '@ansible/portal-core/app-nav';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import catalogImportPlugin from '@backstage/plugin-catalog-import/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import rbacPlugin from '@backstage-community/plugin-rbac/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import { baseApis } from './baseApis';
import { providers } from './identityProviders';
import { optionalContributorLoader } from './composition';
import { NativeGlobalHeader } from './components/GlobalHeader/NativeGlobalHeader';
import { createAapProfileModule } from '@ansible/aap-app-auth';

/** Additive NFS app: no legacy APME entry point or registration side effects. */
export const portalNfsFeatures: (FrontendFeature | FrontendFeatureLoader)[] = [
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
  createAapProfileModule({ logoutDisabled: false }),
  portalNavigation,
  createFrontendModule({
    pluginId: 'app',
    extensions: [
      AppRootWrapperBlueprint.make({
        name: 'portal-shell',
        params: {
          component: ({ children }) => (
            <>
              <NativeGlobalHeader />
              {children}
            </>
          ),
        },
      }),
    ],
  }),
  optionalContributorLoader,
];

export default createApp({ features: portalNfsFeatures }).createRoot();
