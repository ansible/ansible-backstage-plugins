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
import { EETagsPickerExtension } from '@ansible/portal-scaffolder-react';
import { EETagsPickerFieldExtension } from './extensions';

jest.mock('@ansible/portal-scaffolder-react', () => ({
  EETagsPickerExtension: jest.fn(),
}));

describe('EETagsPickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(EETagsPickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'EETagsPicker',
      component: EETagsPickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'EETagsPicker',
      component: EETagsPickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(EETagsPickerExtension).toBeDefined();
  });
});
