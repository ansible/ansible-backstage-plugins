import { createApiRef } from '@backstage/core-plugin-api';
import type { EntityDetailTabDescriptor } from './EntityDetailTabBlueprint';
import type { EntityActionDescriptor } from './EntityActionBlueprint';
import type { EntityOverviewCardDescriptor } from './EntityOverviewCardBlueprint';
import type { CatalogItemActionDescriptor } from './CatalogItemActionBlueprint';
import type { CatalogTabDescriptor } from './CatalogTabBlueprint';
import type { CatalogTableColumnDescriptor } from './CatalogTableColumnBlueprint';
import type { ScaffolderFieldDescriptor } from './ScaffolderFieldBlueprint';
import type { AppHeaderActionDescriptor } from './AppHeaderActionBlueprint';
import type {
  CatalogHeaderActionDescriptor,
  ScaffolderWorkflowDescriptor,
} from './CatalogHeaderActionBlueprint';

/** Immutable NFS inputs, scoped to one app's API holder, not a registration singleton. */
export interface PortalContributionsApi {
  readonly appHeaderActions?: readonly AppHeaderActionDescriptor[];
  readonly tabs: readonly EntityDetailTabDescriptor[];
  readonly actions: readonly EntityActionDescriptor[];
  readonly cards: readonly EntityOverviewCardDescriptor[];
  readonly catalogActions: readonly CatalogItemActionDescriptor[];
  readonly catalogTabs?: readonly CatalogTabDescriptor[];
  readonly catalogColumns?: readonly CatalogTableColumnDescriptor[];
  readonly catalogHeaderActions?: readonly CatalogHeaderActionDescriptor[];
  readonly scaffolderWorkflows?: readonly ScaffolderWorkflowDescriptor[];
  /** Validated declarations, inert until an installed templates adapter consumes them. */
  readonly scaffolderFields?: readonly ScaffolderFieldDescriptor[];
}

export const portalContributionsApiRef = createApiRef<PortalContributionsApi>({
  id: 'ansible.portal.contributions.v1',
});

export const PORTAL_CONTRIBUTIONS_ATTACHMENT = 'api:portal/contributions';
