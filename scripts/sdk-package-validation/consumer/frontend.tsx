import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { AppProfileMenuItemBlueprint } from '@ansible/portal-extension-api/alpha';
import { portalOperationsApiRef } from '@ansible/portal-extension-api';
import type { PluginManifest } from '@ansible/portal-extension-common';
import { EmptyStateView, PageHeader } from '@ansible/portal-plugin-sdk';

export const manifest: PluginManifest = {
  id: 'external-consumer',
  version: '0.1.0',
  apiVersion: '0.1.0',
  capabilities: [],
  entitlements: [],
};
export const operationsApi = portalOperationsApiRef;
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
