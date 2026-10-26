import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { EETagsPickerExtension } from './EETagsPickerExtension';

export const EETagsPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'EETagsPicker',
    component: EETagsPickerExtension,
  }),
);
