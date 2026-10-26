import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { AdditionalBuildStepsPickerExtension } from './AdditionalBuildStepsPickerExtension';

export const AdditionalBuildStepsPickerFieldExtension =
  scaffolderPlugin.provide(
    createScaffolderFieldExtension({
      name: 'AdditionalBuildStepsPicker',
      component: AdditionalBuildStepsPickerExtension,
    }),
  );
