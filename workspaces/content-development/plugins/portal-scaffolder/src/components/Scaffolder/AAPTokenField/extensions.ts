import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { AAPTokenField } from './AAPTokenFieldExtension';
import { AAPTokenFieldFieldSchema } from './schema';

export const AAPTokenFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'AAPTokenField',
    component: AAPTokenField,
    schema: AAPTokenFieldFieldSchema,
  }),
);
