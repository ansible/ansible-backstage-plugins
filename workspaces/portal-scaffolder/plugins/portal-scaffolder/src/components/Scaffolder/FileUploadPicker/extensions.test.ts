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
import { FileUploadPickerExtension } from './FileUploadPickerExtension';
import { createElement } from 'react';
import { FileUploadPickerFieldExtension } from './extensions';

jest.mock('./FileUploadPickerExtension', () => ({
  FileUploadPickerExtension: () =>
    createElement('div', null, 'FileUploadPickerExtension'),
}));

describe('FileUploadPickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(FileUploadPickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'FileUploadPicker',
      component: FileUploadPickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'FileUploadPicker',
      component: FileUploadPickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(FileUploadPickerExtension).toBeDefined();
  });
});
