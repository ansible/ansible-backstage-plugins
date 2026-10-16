import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { PluginManifest } from '@ansible/portal-extension-common';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

/** Catalog-wide workflow launch; there is deliberately no entity or URL. */
export interface CatalogHeaderActionDescriptor {
  manifest: PluginManifest;
  capabilityId: string;
  entryPointId: string;
  attachment: 'catalog.header.actions';
  enabledByConfig?: string;
}
export interface ScaffolderWorkflowDescriptor {
  workflowId: string;
  /** Catalog identity, not an arbitrary route or endpoint. */
  templateRef: string;
  ownerPlugin: string;
}
export const catalogHeaderActionDataRef =
  createExtensionDataRef<CatalogHeaderActionDescriptor>().with({
    id: 'ansible.portal.catalog-header-action.v1',
  });
export const scaffolderWorkflowDataRef =
  createExtensionDataRef<ScaffolderWorkflowDescriptor>().with({
    id: 'ansible.portal.scaffolder-workflow.v1',
  });
export const CatalogHeaderActionBlueprint = createExtensionBlueprint({
  kind: 'catalog-header-action',
  attachTo: {
    id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
    input: 'catalogHeaderActions',
  },
  output: [catalogHeaderActionDataRef],
  factory(params: CatalogHeaderActionDescriptor, { node }) {
    return [
      catalogHeaderActionDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
export const ScaffolderWorkflowBlueprint = createExtensionBlueprint({
  kind: 'scaffolder-workflow',
  attachTo: {
    id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
    input: 'scaffolderWorkflows',
  },
  output: [scaffolderWorkflowDataRef],
  factory(params: Omit<ScaffolderWorkflowDescriptor, 'ownerPlugin'>, { node }) {
    return [
      scaffolderWorkflowDataRef({
        ...params,
        ownerPlugin: node.spec.plugin.id,
      }),
    ];
  },
});
