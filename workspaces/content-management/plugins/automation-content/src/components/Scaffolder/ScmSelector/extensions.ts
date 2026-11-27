import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { ScmSelectorExtension } from './ScmSelectorExtension';

export const ScmSelectorFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'ScmSelector',
    component: ScmSelectorExtension,
  }),
);
