import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { AAPTokenField } from './AAPTokenFieldExtension';

export const AAPTokenFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'AAPTokenField',
    component: AAPTokenField,
  }),
);
