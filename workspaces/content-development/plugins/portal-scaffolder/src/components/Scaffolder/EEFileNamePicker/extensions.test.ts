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
import { EEFileNamePickerExtension } from '@ansible/portal-scaffolder-react';
import { EEFileNamePickerFieldExtension } from './extensions';

jest.mock('@ansible/portal-scaffolder-react', () => ({
  EEFileNamePickerExtension: jest.fn(),
}));

describe('EEFileNamePickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(EEFileNamePickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'EEFileNamePicker',
      component: EEFileNamePickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'EEFileNamePicker',
      component: EEFileNamePickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(EEFileNamePickerExtension).toBeDefined();
  });
});
