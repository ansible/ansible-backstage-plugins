import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import {
  createScaffolderFieldExtension,
  FieldExtensionComponent,
} from '@backstage/plugin-scaffolder-react';

import { RJSFSchema, UIOptionsType } from '@rjsf/utils';

import { AAPResourcePicker } from './AAPResourcePicker';

export const AAPResourcePickerExtension: FieldExtensionComponent<
  any,
  UIOptionsType<any, RJSFSchema, any>
> = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'AAPResourcePicker',
    component: AAPResourcePicker,
  }),
);
