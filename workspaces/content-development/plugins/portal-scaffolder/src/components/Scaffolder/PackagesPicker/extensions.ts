import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { PackagesPickerExtension } from '@ansible/portal-scaffolder-react';

export const PackagesPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'PackagesPicker',
    component: PackagesPickerExtension,
  }),
);
