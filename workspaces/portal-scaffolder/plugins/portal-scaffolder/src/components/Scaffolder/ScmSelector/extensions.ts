import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import { ScmSelectorExtension } from '@ansible/portal-scaffolder-react';

export const ScmSelectorFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'ScmSelector',
    component: ScmSelectorExtension,
  }),
);
