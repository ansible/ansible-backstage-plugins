import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { CollectionsYAMLPickerExtension } from './CollectionsYAMLPickerExtension';

export const CollectionsYAMLPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'CollectionsYAMLPicker',
    component: CollectionsYAMLPickerExtension,
  }),
);
