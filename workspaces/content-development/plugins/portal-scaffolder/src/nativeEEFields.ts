import {
  createFormField,
  FormFieldBlueprint,
} from '@backstage/plugin-scaffolder-react/alpha';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';

/** Stock /create bindings, separate from the Portal-only authoring field slot. */
export const nativeEEFields: ExtensionDefinition[] = [
  FormFieldBlueprint.make({
    name: 'base-image-picker',
    params: {
      field: async () => {
        const { BaseImagePickerExtension } = await import(
          './components/Scaffolder/BaseImagePicker/BaseImagePickerExtension'
        );
        return createFormField({
          name: 'BaseImagePicker',
          component: BaseImagePickerExtension,
        });
      },
    },
  }),
  FormFieldBlueprint.make({
    name: 'collections-picker',
    params: {
      field: async () => {
        const { CollectionsPickerExtension } = await import(
          './components/Scaffolder/CollectionsPicker/CollectionsPickerExtension'
        );
        return createFormField({
          name: 'CollectionsPicker',
          component: CollectionsPickerExtension,
        });
      },
    },
  }),
  FormFieldBlueprint.make({
    name: 'ee-file-name-picker',
    params: {
      field: async () => {
        const { EEFileNamePickerExtension } = await import(
          './components/Scaffolder/EEFileNamePicker'
        );
        return createFormField({
          name: 'EEFileNamePicker',
          // The shared package resolves a different RJSF ErrorSchema type.
          // The stock binding erases the value type; the component stays string-valued.
          component: EEFileNamePickerExtension as Parameters<
            typeof createFormField
          >[0]['component'],
        });
      },
    },
  }),
];
