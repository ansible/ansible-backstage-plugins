import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { FileUploadPickerExtension } from '@ansible/portal-scaffolder-react';

export const FileUploadPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'FileUploadPicker',
    component: FileUploadPickerExtension,
  }),
);
