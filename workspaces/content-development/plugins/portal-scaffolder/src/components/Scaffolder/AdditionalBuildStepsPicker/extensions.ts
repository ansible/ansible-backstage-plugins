import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { AdditionalBuildStepsPickerExtension } from '@ansible/portal-scaffolder-react';

export const AdditionalBuildStepsPickerFieldExtension =
  scaffolderPlugin.provide(
    createScaffolderFieldExtension({
      name: 'AdditionalBuildStepsPicker',
      component: AdditionalBuildStepsPickerExtension,
    }),
  );
