import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { AppProfileMenuItemBlueprint } from '@ansible/portal-extension-api/alpha';
import { portalOperationsApiRef } from '@ansible/portal-extension-api';
import { gitRepositoriesExtensionsApiRef } from '@ansible/portal-extension-api/gitRepositoriesExtensions';
import { gitRepositoriesCatalogApiRef } from '@ansible/portal-extension-api/gitRepositoriesCatalog';
import type { PluginManifest } from '@ansible/portal-extension-common';
import {
  gitRepositoriesViewPermission,
  SCM_INTEGRATION_AUTH_FAILED_CODE,
} from '@ansible/portal-extension-common';
import { EmptyStateView, PageHeader } from '@ansible/portal-plugin-sdk';

export const manifest: PluginManifest = {
  id: 'external-consumer',
  version: '0.1.0',
  apiVersion: '0.1.0',
  capabilities: [],
  entitlements: [],
};
export const operationsApi = portalOperationsApiRef;
export const repositoryContracts = {
  extensions: gitRepositoriesExtensionsApiRef,
  catalog: gitRepositoriesCatalogApiRef,
  permission: gitRepositoriesViewPermission,
  scmError: SCM_INTEGRATION_AUTH_FAILED_CODE,
};
export const contributor = createFrontendPlugin({
  pluginId: 'external-consumer',
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/external',
        loader: async () => (
          <>
            <PageHeader title="External contributor" />
            <EmptyStateView title="No items" />
          </>
        ),
      },
    }),
    AppProfileMenuItemBlueprint.make({
      name: 'external',
      params: {
        title: 'External contributor',
        type: 'navigation',
        targetPage: 'page:external-consumer',
        authorization: { type: 'authenticated' },
      },
    }),
  ],
});
