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
import { PackagesPickerExtension } from '@ansible/portal-scaffolder-react';
import { PackagesPickerFieldExtension } from './extensions';

jest.mock('@ansible/portal-scaffolder-react', () => ({
  PackagesPickerExtension: jest.fn(),
}));

describe('PackagesPickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(PackagesPickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'PackagesPicker',
      component: PackagesPickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'PackagesPicker',
      component: PackagesPickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(PackagesPickerExtension).toBeDefined();
  });
});
