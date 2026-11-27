import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { CollectionsPickerExtension } from './CollectionsPickerExtension';

export const CollectionsPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'CollectionsPicker',
    component: CollectionsPickerExtension,
  }),
);
