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
import { BaseImagePickerExtension } from './BaseImagePickerExtension';
import { createElement } from 'react';
import { BaseImagePickerFieldExtension } from './extensions';

jest.mock('./BaseImagePickerExtension', () => ({
  BaseImagePickerExtension: () =>
    createElement('div', null, 'BaseImagePickerExtension'),
}));

describe('BaseImagePickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(BaseImagePickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'BaseImagePicker',
      component: BaseImagePickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'BaseImagePicker',
      component: BaseImagePickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(BaseImagePickerExtension).toBeDefined();
  });
});
