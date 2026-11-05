import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { EEFileNamePickerExtension } from '@ansible/portal-scaffolder-react';

export const EEFileNamePickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'EEFileNamePicker',
    component: EEFileNamePickerExtension,
  }),
);
