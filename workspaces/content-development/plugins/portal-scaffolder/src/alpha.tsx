import {
  ApiBlueprint,
  SubPageBlueprint,
  createFrontendPlugin,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import { createPortalScaffolderPage } from '@ansible/portal-extension-host/alpha';
import { createPortalScaffolderFieldBlueprints } from '@ansible/portal-extension-api/alpha';
import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import { portalScaffolderRoutePaths } from '@ansible/portal-scaffolder-common';
import { AAPApis, EEBuildApis } from './apis';
import { rootRouteRef } from './routes';
import HomeIcon from '@material-ui/icons/Home';
import {
  scaffolderFieldEntries,
  selfServiceManifest,
} from './selfServiceManifest';
import { aapUserTokenFormDecorator } from './scaffolder/aapUserTokenDecorator';
import {
  validateEEFileName,
  validateEETags,
} from './scaffolder/nativeFieldValidation';

type ScaffolderFieldName = (typeof scaffolderFieldEntries)[number]['fieldName'];

/** Erase each widget's value/UI generics only at the heterogeneous loader map boundary. */
function eraseScaffolderFieldTypes<TValue, TUiOptions>(
  field: FieldExtensionOptions<TValue, TUiOptions>,
): FieldExtensionOptions<any, any> {
  return field as unknown as FieldExtensionOptions<any, any>;
}

/** Load custom widgets lazily while exposing them through the generic SDK field contract. */
export const scaffolderFieldLoaders: Record<
  ScaffolderFieldName,
  () => Promise<FieldExtensionOptions<any, any>>
> = {
  AAPResourcePicker: async () => {
    const { AAPResourcePicker } = await import(
      './components/Scaffolder/AAResourcePicker/AAPResourcePicker'
    );
    return eraseScaffolderFieldTypes({
      name: 'AAPResourcePicker',
      component: AAPResourcePicker,
    });
  },
  BaseImagePicker: async () => {
    const { BaseImagePickerExtension } = await import(
      './components/Scaffolder/BaseImagePicker/BaseImagePickerExtension'
    );
    return eraseScaffolderFieldTypes({
      name: 'BaseImagePicker',
      component: BaseImagePickerExtension,
    });
  },
  FileUploadPicker: async () => {
    const { FileUploadPickerExtension } = await import(
      '@ansible/portal-scaffolder-react'
    );
    return eraseScaffolderFieldTypes({
      name: 'FileUploadPicker',
      component: FileUploadPickerExtension,
    });
  },
  PackagesPicker: async () => {
    const { PackagesPickerExtension } = await import(
      '@ansible/portal-scaffolder-react'
    );
    return eraseScaffolderFieldTypes({
      name: 'PackagesPicker',
      component: PackagesPickerExtension,
    });
  },
  MCPServersPicker: async () => {
    const { MCPServersPickerExtension } = await import(
      '@ansible/portal-scaffolder-react'
    );
    return eraseScaffolderFieldTypes({
      name: 'MCPServersPicker',
      component: MCPServersPickerExtension,
    });
  },
  AdditionalBuildStepsPicker: async () => {
    const { AdditionalBuildStepsPickerExtension } = await import(
      '@ansible/portal-scaffolder-react'
    );
    return eraseScaffolderFieldTypes({
      name: 'AdditionalBuildStepsPicker',
      component: AdditionalBuildStepsPickerExtension,
    });
  },
  EEFileNamePicker: async () => {
    const { EEFileNamePickerExtension } = await import(
      '@ansible/portal-scaffolder-react'
    );
    return eraseScaffolderFieldTypes({
      name: 'EEFileNamePicker',
      component: EEFileNamePickerExtension,
      validation: (value, validation) => {
        validateEEFileName(value).forEach(error => validation.addError(error));
      },
    });
  },
  EETagsPicker: async () => {
    const { EETagsPickerExtension } = await import(
      '@ansible/portal-scaffolder-react'
    );
    return eraseScaffolderFieldTypes({
      name: 'EETagsPicker',
      component: EETagsPickerExtension,
      validation: (value, validation) => {
        validateEETags(value).forEach(error => validation.addError(error));
      },
    });
  },
};

/** Native discovery and lifecycle around the existing Portal wizard. */
const portalScaffolderPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'portal-scaffolder',
  title: 'Templates',
  icon: <HomeIcon />,
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
  },
  extensions: [
    aapUserTokenFormDecorator,
    ApiBlueprint.make({ name: 'aap', params: define => define(AAPApis) }),
    ApiBlueprint.make({
      name: 'ee-build',
      params: define => define(EEBuildApis),
    }),
    ...scaffolderFieldEntries.flatMap(({ fieldName, id }) =>
      createPortalScaffolderFieldBlueprints(fieldName, {
        manifest: selfServiceManifest,
        capabilityId: 'portal-scaffolder.scaffolder-fields',
        entryPointId: id,
        attachment: 'scaffolder.fields',
        fieldName,
        loader: scaffolderFieldLoaders[fieldName],
      }),
    ),
    SubPageBlueprint.make({
      name: 'ee-definitions',
      attachTo: { id: 'page:automation-content/ee', input: 'pages' },
      params: {
        path: 'definitions',
        title: 'Definitions',
        loader: async () => {
          const { EEDefinitionsTab } = await import(
            './components/ExecutionEnvironments/EEDefinitionsTab'
          );
          return compatWrapper(<EEDefinitionsTab />);
        },
      },
    }),
    createPortalScaffolderPage({
      path: portalScaffolderRoutePaths.root,
      routeRef: convertLegacyRouteRef(rootRouteRef),
      loader: async fields => {
        const { NativeScaffolderPage } = await import(
          './components/NativeScaffolderPage'
        );
        return compatWrapper(<NativeScaffolderPage declarations={fields} />);
      },
    }),
  ],
});
export default portalScaffolderPlugin;
