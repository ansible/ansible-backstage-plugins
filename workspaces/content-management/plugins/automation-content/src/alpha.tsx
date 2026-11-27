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
import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import { automationContentApiFactory } from './api';
import {
  automationContentManifest,
  collectionsPickerEntryId,
  eeCapabilityId,
  eeDetailsEntryId,
  eeVersionFieldEntryId,
  scmSelectorEntryId,
} from './manifest';

import { eeRouteRef, templatesRouteRef } from './routes';

function eraseScaffolderFieldTypes<TValue, TUiOptions>(
  field: FieldExtensionOptions<TValue, TUiOptions>,
): FieldExtensionOptions<any, any> {
  return field as unknown as FieldExtensionOptions<any, any>;
}

export const loadScmSelectorField = async (): Promise<
  FieldExtensionOptions<any, any>
> => {
  const { ScmSelectorExtension } = await import(
    './components/Scaffolder/ScmSelector/ScmSelectorExtension'
  );
  const { validateScmSelector } = await import(
    './components/Scaffolder/ScmSelector/validation'
  );
  return eraseScaffolderFieldTypes({
    name: 'ScmSelector',
    component: ScmSelectorExtension,
    validation: (value, validation, context) => {
      const options = context.uiSchema?.['ui:options'] as
        | { requestUserCredentials?: unknown }
        | undefined;
      validateScmSelector(
        value,
        Boolean(options?.requestUserCredentials),
      ).forEach(error => validation.addError(error));
    },
  });
};

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
  routes: { ee: eeRouteRef },
  externalRoutes: { templates: templatesRouteRef },
  extensions: [
    ApiBlueprint.make({
      params: define => define(automationContentApiFactory),
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
      capabilityId: 'automation-content.scaffolder-fields',
      entryPointId: collectionsPickerEntryId,
      attachment: 'scaffolder.fields',
      fieldName: 'CollectionsPicker',
      loader: async () => {
        const { CollectionsPickerExtension } = await import(
          './components/Scaffolder/CollectionsPicker/CollectionsPickerExtension'
        );
        return eraseScaffolderFieldTypes({
          name: 'CollectionsPicker',
          component: CollectionsPickerExtension,
        });
      },
    }),
    ...createPortalScaffolderFieldBlueprints('scm-selector', {
      manifest: automationContentManifest,
      capabilityId: 'automation-content.scaffolder-fields',
      entryPointId: scmSelectorEntryId,
      attachment: 'scaffolder.fields',
      fieldName: 'ScmSelector',
      loader: loadScmSelectorField,
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
