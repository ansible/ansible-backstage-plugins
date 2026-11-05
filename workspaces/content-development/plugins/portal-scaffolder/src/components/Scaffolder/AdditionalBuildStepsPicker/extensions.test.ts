jest.mock('@backstage/plugin-scaffolder', () => ({
  scaffolderPlugin: {
    provide: jest.fn(arg => arg),
  },
}));

jest.mock('@backstage/plugin-scaffolder-react', () => ({
  createScaffolderFieldExtension: jest.fn(arg => arg),
}));

import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { AdditionalBuildStepsPickerExtension } from '@ansible/portal-scaffolder-react';
import { AdditionalBuildStepsPickerFieldExtension } from './extensions';

jest.mock('@ansible/portal-scaffolder-react', () => ({
  AdditionalBuildStepsPickerExtension: jest.fn(),
}));

describe('AdditionalBuildStepsPickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(AdditionalBuildStepsPickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'AdditionalBuildStepsPicker',
      component: AdditionalBuildStepsPickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'AdditionalBuildStepsPicker',
      component: AdditionalBuildStepsPickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(AdditionalBuildStepsPickerExtension).toBeDefined();
  });
});
