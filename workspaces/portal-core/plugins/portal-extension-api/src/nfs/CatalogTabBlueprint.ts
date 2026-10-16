import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { PluginManifest } from '@ansible/portal-extension-common';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

export interface CatalogContributionContext {
  contentType: string;
  /** Host-owned entity navigation; a contribution never supplies a route. */
  entityDetailPath: (
    entityName: string,
    entryPointId?: string,
    filters?: Record<string, string>,
  ) => string;
}
export interface CatalogTabDescriptor {
  manifest: PluginManifest;
  capabilityId: string;
  entryPointId: string;
  attachment: 'catalog.tabs';
  enabledByConfig?: string;
  loader: (context: CatalogContributionContext) => Promise<JSX.Element>;
}
export const catalogTabDataRef =
  createExtensionDataRef<CatalogTabDescriptor>().with({
    id: 'ansible.portal.catalog-tab.v1',
  });
export const CatalogTabBlueprint = createExtensionBlueprint({
  kind: 'catalog-tab',
  attachTo: { id: PORTAL_CONTRIBUTIONS_ATTACHMENT, input: 'catalogTabs' },
  output: [catalogTabDataRef],
  factory(params: CatalogTabDescriptor, { node }) {
    return [
      catalogTabDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
