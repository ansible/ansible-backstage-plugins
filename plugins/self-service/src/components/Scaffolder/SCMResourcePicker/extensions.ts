import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import {
  createScaffolderFieldExtension,
  FieldExtensionComponent,
} from '@backstage/plugin-scaffolder-react';

import { RJSFSchema, UIOptionsType } from '@rjsf/utils';

import { SCMResourcePicker } from './SCMResourcePicker';

export const SCMResourcePickerExtension: FieldExtensionComponent<
  any,
  UIOptionsType<any, RJSFSchema, any>
> = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'SCMResourcePicker',
    component: SCMResourcePicker,
  }),
);
