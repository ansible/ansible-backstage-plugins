import type { Entity } from '@backstage/catalog-model';
import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { PluginManifest } from '@ansible/portal-extension-common';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

/** @deprecated Name retained for PoC consumers; this now attaches to the shared provider. */
export const PORTAL_ENTITY_PAGE_ATTACHMENT = {
  id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
  input: 'entityTabs',
} as const;

export interface EntityContributionContext {
  entity: Entity;
  contentType: string;
  /** Source observations are supplied by the host, never inferred by it. */
  sourceKinds?: readonly string[];
}

export interface EntityDetailTabDescriptor {
  manifest: PluginManifest;
  capabilityId: string;
  entryPointId: string;
  attachment: 'entity.detail.tabs';
  appliesToSourceKinds?: readonly string[];
  enabledByConfig?: string;
  requiredEntitlements?: readonly string[];
  /** Runtime code stays in the federated module, outside the manifest. */
  isApplicable?: (
    context: EntityContributionContext,
  ) => boolean | Promise<boolean>;
  loader: (context: EntityContributionContext) => Promise<JSX.Element>;
}

/** IDs, rather than singleton object identity, connect federated extensions. */
export const entityDetailTabDataRef =
  createExtensionDataRef<EntityDetailTabDescriptor>().with({
    id: 'ansible.portal.entity-detail-tab.v1',
  });

export const EntityDetailTabBlueprint = createExtensionBlueprint({
  kind: 'entity-detail-tab',
  attachTo: PORTAL_ENTITY_PAGE_ATTACHMENT,
  output: [entityDetailTabDataRef],
  factory(params: EntityDetailTabDescriptor, { node }) {
    // Ownership comes from the NFS plugin, not a caller-supplied registry key.
    return [
      entityDetailTabDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
