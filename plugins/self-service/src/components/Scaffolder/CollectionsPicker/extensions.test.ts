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
import { CollectionsPickerExtension } from './CollectionsPickerExtension';
import { createElement } from 'react';
import { CollectionsPickerFieldExtension } from './extensions';

jest.mock('./CollectionsPickerExtension', () => ({
  CollectionsPickerExtension: () =>
    createElement('div', null, 'CollectionsPickerExtension'),
}));

describe('CollectionsPickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(CollectionsPickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'CollectionsPicker',
      component: CollectionsPickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'CollectionsPicker',
      component: CollectionsPickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(CollectionsPickerExtension).toBeDefined();
  });
});
