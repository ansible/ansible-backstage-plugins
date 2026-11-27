import {
  ApiBlueprint,
  createFrontendPlugin,
  PageBlueprint,
  PluginHeaderActionBlueprint,
  SubPageBlueprint,
  type ExtensionDefinition,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import {
  EntityContentLayoutBlueprint,
  EntityHeaderLayoutBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { RiBox3Line } from '@remixicon/react';
import {
  EE_REPOSITORY_ANNOTATIONS,
  EE_REPOSITORY_ENTITY_TYPE,
} from '@ansible/automation-content-common/eeRepository';
import {
  createPortalScaffolderFieldBlueprints,
  EntityDetailTabBlueprint,
} from '@ansible/portal-extension-api/alpha';
import { portalTemplatesRouteRef } from '@ansible/portal-extension-api';
import { gitRepositoriesCatalogApiFactory } from './components/GitRepositories/gitRepositoriesCatalogApi';
import { automationContentApiFactory } from './api';
import { validateScmSelector } from './components/Scaffolder/ScmSelector/validation';
import type { ScmSelectorData } from './components/Scaffolder/ScmSelector/ScmSelectorExtension';
import {
  automationContentManifest,
  eeCapabilityId,
  eeDetailsEntryId,
  eeVersionFieldEntryId,
  movedFieldsCapabilityId,
  collectionsPickerFieldEntryId,
  scmSelectorFieldEntryId,
} from './manifest';

import {
  eeRouteRef,
  collectionsRouteRef,
  gitRepositoriesRouteRef,
  COLLECTIONS_ROUTE_PATH,
  GIT_REPOSITORIES_ROUTE_PATH,
} from './routes';

function isEERepository(entity: Entity): boolean {
  return (
    entity.kind.toLowerCase() === 'component' &&
    entity.spec?.type === EE_REPOSITORY_ENTITY_TYPE &&
    entity.metadata.annotations?.[EE_REPOSITORY_ANNOTATIONS.marker] === 'true'
  );
}

export const eeHeaderLayout: ExtensionDefinition =
  EntityHeaderLayoutBlueprint.make({
    name: 'ee-repository',
    params: {
      filter: isEERepository,
      loader: async () =>
        (await import('./components/ExecutionEnvironments/EERepositoryHeader'))
          .EERepositoryHeader,
    },
  });

export const eeOverviewLayout: ExtensionDefinition =
  EntityContentLayoutBlueprint.make({
    name: 'ee-repository',
    params: {
      filter: isEERepository,
      loader: async () =>
        (await import('./components/ExecutionEnvironments/EEEntityContent'))
          .EEEntityContent,
    },
  });

const automationContentPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'automation-content',
  routes: {
    ee: eeRouteRef,
    collections: collectionsRouteRef,
    gitRepositories: gitRepositoriesRouteRef,
  },
  externalRoutes: { templates: portalTemplatesRouteRef },
  extensions: [
    ApiBlueprint.make({
      params: define => define(automationContentApiFactory),
    }),
    ApiBlueprint.make({
      name: 'git-repositories-catalog',
      params: define => define(gitRepositoriesCatalogApiFactory),
    }),
    PageBlueprint.make({
      name: 'ee',
      params: {
        path: '/content/ee',
        routeRef: eeRouteRef,
        title: 'Execution Environments',
        icon: <RiBox3Line />,
      },
    }),
    PageBlueprint.make({
      name: 'collections',
      params: {
        path: COLLECTIONS_ROUTE_PATH,
        routeRef: collectionsRouteRef,
        title: 'Collections',
        icon: <RiBox3Line />,
        noHeader: true,
        loader: async () => {
          const { ContentCatalogBoundary } = await import(
            './components/ContentCatalogBoundary'
          );
          const { CollectionsRoutesPage } = await import(
            './components/CollectionsCatalog'
          );
          return (
            <ContentCatalogBoundary>
              <CollectionsRoutesPage />
            </ContentCatalogBoundary>
          );
        },
      },
    }),
    PageBlueprint.make({
      name: 'repositories',
      params: {
        path: GIT_REPOSITORIES_ROUTE_PATH,
        routeRef: gitRepositoriesRouteRef,
        title: 'Git repositories',
        icon: <RiBox3Line />,
        noHeader: true,
        loader: async () => {
          const { ContentCatalogBoundary } = await import(
            './components/ContentCatalogBoundary'
          );
          const { GitRepositoriesRoutesPage } = await import(
            './components/GitRepositories'
          );
          return (
            <ContentCatalogBoundary>
              <GitRepositoriesRoutesPage />
            </ContentCatalogBoundary>
          );
        },
      },
    }),
    SubPageBlueprint.make({
      name: 'images',
      attachTo: { id: 'page:automation-content/ee', input: 'pages' },
      params: {
        path: 'images',
        title: 'Images',
        loader: async () => {
          const { EEImagesPage } = await import(
            './components/ExecutionEnvironments/EEImagesPage'
          );
          return <EEImagesPage />;
        },
      },
    }),
    PluginHeaderActionBlueprint.make({
      name: 'execution-environments',
      params: {
        loader: async () => {
          const { EEHeaderActions } = await import(
            './components/ExecutionEnvironments/EEHeaderActions'
          );
          return <EEHeaderActions />;
        },
      },
    }),
    ...createPortalScaffolderFieldBlueprints('ee-image-version', {
      manifest: automationContentManifest,
      capabilityId: eeCapabilityId,
      entryPointId: eeVersionFieldEntryId,
      attachment: 'scaffolder.fields',
      fieldName: 'EEImageVersionPicker',
      loader: async () => {
        const { EEImageVersionPicker } = await import(
          './components/ExecutionEnvironments/EEImageVersionPicker'
        );
        return {
          name: 'EEImageVersionPicker',
          component: EEImageVersionPicker,
        };
      },
    }),
    ...createPortalScaffolderFieldBlueprints('collections-picker', {
      manifest: automationContentManifest,
      capabilityId: movedFieldsCapabilityId,
      entryPointId: collectionsPickerFieldEntryId,
      attachment: 'scaffolder.fields',
      fieldName: 'CollectionsPicker',
      loader: async () => {
        const { CollectionsPickerExtension } = await import(
          './components/Scaffolder/CollectionsPicker/CollectionsPickerExtension'
        );
        return {
          name: 'CollectionsPicker',
          component: CollectionsPickerExtension,
        };
      },
    }),
    ...createPortalScaffolderFieldBlueprints('scm-selector', {
      manifest: automationContentManifest,
      capabilityId: movedFieldsCapabilityId,
      entryPointId: scmSelectorFieldEntryId,
      attachment: 'scaffolder.fields',
      fieldName: 'ScmSelector',
      loader: async () => {
        const { ScmSelectorExtension } = await import(
          './components/Scaffolder/ScmSelector/ScmSelectorExtension'
        );
        return {
          name: 'ScmSelector',
          component: ScmSelectorExtension,
          validation: (value, validation, context) => {
            const options = context.uiSchema?.['ui:options'] as
              | { requestUserCredentials?: unknown }
              | undefined;
            validateScmSelector(
              value as ScmSelectorData | undefined,
              Boolean(options?.requestUserCredentials),
            ).forEach(error => validation.addError(error));
          },
        };
      },
    }),
    eeHeaderLayout,
    eeOverviewLayout,
    EntityDetailTabBlueprint.make({
      name: 'image',
      params: {
        manifest: automationContentManifest,
        capabilityId: eeCapabilityId,
        entryPointId: eeDetailsEntryId,
        attachment: 'entity.detail.tabs',
        loader: async ({ entity }) => {
          const { EEImageDetails } = await import(
            './components/ExecutionEnvironments/EEImageDetails'
          );
          return <EEImageDetails entity={entity} />;
        },
      },
    }),
  ],
});

export default automationContentPlugin;
