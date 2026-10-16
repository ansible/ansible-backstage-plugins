/** NFS adapters only. Importing this entry point never registers a plugin. */
export {
  CatalogTableColumnBlueprint,
  catalogTableColumnDataRef,
} from './nfs/CatalogTableColumnBlueprint';
export type { CatalogTableColumnDescriptor } from './nfs/CatalogTableColumnBlueprint';
export {
  CatalogTabBlueprint,
  catalogTabDataRef,
} from './nfs/CatalogTabBlueprint';
export type {
  CatalogTabDescriptor,
  CatalogContributionContext,
} from './nfs/CatalogTabBlueprint';
export {
  CatalogHeaderActionBlueprint,
  ScaffolderWorkflowBlueprint,
  catalogHeaderActionDataRef,
  scaffolderWorkflowDataRef,
} from './nfs/CatalogHeaderActionBlueprint';
export type {
  CatalogHeaderActionDescriptor,
  ScaffolderWorkflowDescriptor,
} from './nfs/CatalogHeaderActionBlueprint';
export {
  portalContributionsApiRef,
  PORTAL_CONTRIBUTIONS_ATTACHMENT,
} from './nfs/contributions';
export type { PortalContributionsApi } from './nfs/contributions';
export {
  ScaffolderFieldBlueprint,
  scaffolderFieldDataRef,
  defineScaffolderField,
} from './nfs/ScaffolderFieldBlueprint';
export type { ScaffolderFieldDescriptor } from './nfs/ScaffolderFieldBlueprint';
export {
  CatalogItemActionBlueprint,
  catalogItemActionDataRef,
} from './nfs/CatalogItemActionBlueprint';
export type { CatalogItemActionDescriptor } from './nfs/CatalogItemActionBlueprint';
export {
  EntityOverviewCardBlueprint,
  entityOverviewCardDataRef,
} from './nfs/EntityOverviewCardBlueprint';
export type {
  EntityOverviewCardContext,
  EntityOverviewCardDescriptor,
} from './nfs/EntityOverviewCardBlueprint';
export {
  EntityActionBlueprint,
  entityActionDataRef,
} from './nfs/EntityActionBlueprint';
export type { EntityActionDescriptor } from './nfs/EntityActionBlueprint';
export {
  EntityDetailTabBlueprint,
  entityDetailTabDataRef,
  PORTAL_ENTITY_PAGE_ATTACHMENT,
} from './nfs/EntityDetailTabBlueprint';
export type {
  EntityContributionContext,
  EntityDetailTabDescriptor,
} from './nfs/EntityDetailTabBlueprint';
