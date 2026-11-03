jest.mock('@backstage/plugin-scaffolder', () => ({
  scaffolderPlugin: {
    provide: jest.fn(arg => arg),
  },
}));

jest.mock('@backstage/plugin-scaffolder-react', () => ({
  createScaffolderFieldExtension: jest.fn(arg => arg),
}));

jest.mock('@ansible/portal-scaffolder-react', () => ({
  FileUploadPickerExtension: jest.fn(),
}));

import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { FileUploadPickerExtension } from '@ansible/portal-scaffolder-react';
import { FileUploadPickerFieldExtension } from './extensions';

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
