import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { EntityDetailTabDescriptor } from './EntityDetailTabBlueprint';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

export interface CatalogTableColumnDescriptor
  extends Omit<EntityDetailTabDescriptor, 'attachment'> {
  attachment: 'catalog.table.columns';
  tooltip?: string;
}
export const catalogTableColumnDataRef =
  createExtensionDataRef<CatalogTableColumnDescriptor>().with({
    id: 'ansible.portal.catalog-table-column.v1',
  });
export const CatalogTableColumnBlueprint = createExtensionBlueprint({
  kind: 'catalog-table-column',
  attachTo: { id: PORTAL_CONTRIBUTIONS_ATTACHMENT, input: 'catalogColumns' },
  output: [catalogTableColumnDataRef],
  factory(params: CatalogTableColumnDescriptor, { node }) {
    return [
      catalogTableColumnDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
