import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { ScmAuthPickerExtension } from './ScmAuthPickerExtension';

export const ScmAuthPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'ScmAuthPicker',
    component: ScmAuthPickerExtension,
  }),
);
