import {
  createScaffolderFieldExtension,
  FieldExtensionComponentProps,
} from '@backstage/plugin-scaffolder-react';
import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import type { FieldValidation } from '@rjsf/utils';
import { TextField } from '@material-ui/core';

const MockDelayComponent = (
  props: FieldExtensionComponentProps<{ test?: string }>,
) => {
  const { onChange, formData, rawErrors = [] } = props;
  return (
    <TextField
      label="test"
      helperText="description"
      value={formData?.test ?? ''}
      onChange={({ target: { value } }) => onChange({ test: value })}
      margin="normal"
      error={rawErrors?.length > 0 && !formData}
    />
  );
};

export const DelayingComponentFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'DelayingComponent',
    component: MockDelayComponent,
    validation: async (
      value: { test?: string },
      validation: FieldValidation,
    ) => {
      // delay 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (value.test !== 'pass') {
        validation.addError('value was not equal to pass');
      }
    },
  }),
);
