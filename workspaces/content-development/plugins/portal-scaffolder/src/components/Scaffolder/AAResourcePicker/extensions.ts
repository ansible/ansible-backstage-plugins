import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import {
  makeFieldSchema,
  createScaffolderFieldExtension,
} from '@backstage/plugin-scaffolder-react';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import {
  createFormField,
  FormFieldBlueprint,
} from '@backstage/plugin-scaffolder-react/alpha';

import { AAPResourcePicker } from './AAPResourcePicker';

export const AAPResourcePickerExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'AAPResourcePicker',
    component: AAPResourcePicker,
  }),
);

const AAPResourcePickerFormField = createFormField({
  name: 'AAPResourcePicker',
  component: AAPResourcePicker,
  schema: makeFieldSchema({
    output: z => z.unknown(),
    uiOptions: z => z.unknown(),
  }),
});

/** Native Backstage Scaffolder registration; the legacy extension remains available. */
export const AAPResourcePickerFormFieldExtension: ExtensionDefinition =
  FormFieldBlueprint.make({
    name: 'aap-resource-picker',
    params: { field: async () => AAPResourcePickerFormField },
  });
