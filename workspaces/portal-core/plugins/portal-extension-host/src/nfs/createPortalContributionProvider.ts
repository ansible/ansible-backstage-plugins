import {
  ApiBlueprint,
  createExtensionInput,
} from '@backstage/frontend-plugin-api';
import { createApiFactory } from '@backstage/core-plugin-api';
import {
  portalContributionsApiRef,
  appProfileMenuItemDataRef,
  entityDetailTabDataRef,
  entityActionDataRef,
  entityOverviewCardDataRef,
  catalogItemActionDataRef,
  catalogHeaderActionDataRef,
  scaffolderWorkflowDataRef,
  catalogTabDataRef,
  catalogTableColumnDataRef,
  scaffolderFieldDataRef,
} from '@ansible/portal-extension-api/alpha';
import { collectAppProfileMenuItems } from './appProfileMenuItems';
import { collectEntityTabs } from './validateEntityTab';
import { collectCatalogTabs } from './catalogTabs';
import { collectCatalogColumns } from './catalogColumns';
import { collectEntityActions } from './validateEntityAction';
import { collectEntityOverviewCards } from './validateEntityOverviewCard';
import { collectCatalogItemActions } from './validateCatalogItemAction';
import { collectScaffolderFields } from './validateScaffolderField';
import {
  collectCatalogHeaderActions,
  collectScaffolderWorkflows,
} from './catalogHeaderActions';

/** Install once in the portal plugin. NFS remains the only contribution collector. */
export function createPortalContributionProvider(hostApiVersion = '0.1.0') {
  return ApiBlueprint.makeWithOverrides({
    name: 'contributions',
    inputs: {
      appProfileMenuItems: createExtensionInput([appProfileMenuItemDataRef]),
      entityTabs: createExtensionInput([entityDetailTabDataRef]),
      entityActions: createExtensionInput([entityActionDataRef]),
      entityOverviewCards: createExtensionInput([entityOverviewCardDataRef]),
      catalogItemActions: createExtensionInput([catalogItemActionDataRef]),
      catalogHeaderActions: createExtensionInput([catalogHeaderActionDataRef]),
      scaffolderWorkflows: createExtensionInput([scaffolderWorkflowDataRef]),
      catalogTabs: createExtensionInput([catalogTabDataRef]),
      catalogColumns: createExtensionInput([catalogTableColumnDataRef]),
      scaffolderFields: createExtensionInput([scaffolderFieldDataRef]),
    },
    factory(originalFactory, { inputs }) {
      const workflows = Object.freeze(
        collectScaffolderWorkflows(
          inputs.scaffolderWorkflows.map(input => ({
            ...input.get(scaffolderWorkflowDataRef),
            ownerPlugin: input.node.spec.plugin.id,
          })),
        ),
      );
      const contributions = Object.freeze({
        appProfileMenuItems: Object.freeze(
          collectAppProfileMenuItems(
            inputs.appProfileMenuItems.map(input => ({
              ...input.get(appProfileMenuItemDataRef),
              id: input.node.spec.id,
              ownerPlugin: input.node.spec.plugin.id,
            })),
          ),
        ),
        scaffolderFields: Object.freeze(
          collectScaffolderFields(
            inputs.scaffolderFields.map(input => {
              const field = input.get(scaffolderFieldDataRef);
              return {
                ...field,
                manifest: { ...field?.manifest, id: input.node.spec.plugin.id },
              };
            }),
            hostApiVersion,
          ),
        ),
        catalogColumns: Object.freeze(
          collectCatalogColumns(
            inputs.catalogColumns.map(input =>
              input.get(catalogTableColumnDataRef),
            ),
            hostApiVersion,
          ),
        ),
        catalogTabs: Object.freeze(
          collectCatalogTabs(
            inputs.catalogTabs.map(input => ({
              ...input.get(catalogTabDataRef),
              manifest: {
                ...input.get(catalogTabDataRef)?.manifest,
                id: input.node.spec.plugin.id,
              },
            })),
            hostApiVersion,
          ),
        ),
        scaffolderWorkflows: workflows,
        catalogHeaderActions: Object.freeze(
          collectCatalogHeaderActions(
            inputs.catalogHeaderActions.map(input => ({
              ...input.get(catalogHeaderActionDataRef),
              manifest: {
                ...input.get(catalogHeaderActionDataRef).manifest,
                id: input.node.spec.plugin.id,
              },
            })),
            workflows,
            hostApiVersion,
          ),
        ),
        tabs: Object.freeze(
          collectEntityTabs(
            inputs.entityTabs.map(input => {
              const value = input.get(entityDetailTabDataRef);
              return {
                ...value,
                manifest: { ...value?.manifest, id: input.node.spec.plugin.id },
              };
            }),
            hostApiVersion,
          ),
        ),
        actions: Object.freeze(
          collectEntityActions(
            inputs.entityActions.map(input => {
              const value = input.get(entityActionDataRef);
              return {
                ...value,
                manifest: { ...value?.manifest, id: input.node.spec.plugin.id },
              };
            }),
            hostApiVersion,
          ),
        ),
        cards: Object.freeze(
          collectEntityOverviewCards(
            inputs.entityOverviewCards.map(input => {
              const value = input.get(entityOverviewCardDataRef);
              return {
                ...value,
                manifest: { ...value?.manifest, id: input.node.spec.plugin.id },
              };
            }),
            hostApiVersion,
          ),
        ),
        catalogActions: Object.freeze(
          collectCatalogItemActions(
            inputs.catalogItemActions.map(input => {
              const value = input.get(catalogItemActionDataRef);
              return {
                ...value,
                manifest: { ...value?.manifest, id: input.node.spec.plugin.id },
              };
            }),
            hostApiVersion,
          ),
        ),
      });
      return originalFactory(define =>
        define(
          createApiFactory({
            api: portalContributionsApiRef,
            deps: {},
            factory: () => contributions,
          }),
        ),
      );
    },
  });
}
