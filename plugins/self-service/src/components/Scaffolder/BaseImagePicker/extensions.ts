import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { BaseImagePickerExtension } from './BaseImagePickerExtension';

export const BaseImagePickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'BaseImagePicker',
    component: BaseImagePickerExtension,
  }),
);
