import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { EntityDetailTabDescriptor } from './EntityDetailTabBlueprint';
import type { EntityActionDescriptor } from './EntityActionBlueprint';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

/** Row-scoped operation; placement and navigation belong to the host. */
export interface CatalogItemActionDescriptor
  extends Omit<EntityDetailTabDescriptor, 'attachment' | 'loader'> {
  attachment: 'catalog.item.actions';
  confirmation?: NonNullable<EntityActionDescriptor['confirmation']>;
  completion?: NonNullable<EntityActionDescriptor['completion']>;
}

export const catalogItemActionDataRef =
  createExtensionDataRef<CatalogItemActionDescriptor>().with({
    id: 'ansible.portal.catalog-item-action.v1',
  });

export const CatalogItemActionBlueprint = createExtensionBlueprint({
  kind: 'catalog-item-action',
  attachTo: {
    id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
    input: 'catalogItemActions',
  },
  output: [catalogItemActionDataRef],
  factory(params: CatalogItemActionDescriptor, { node }) {
    return [
      catalogItemActionDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
