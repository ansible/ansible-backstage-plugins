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
  import { CollectionsYAMLPickerExtension } from './CollectionsYAMLPickerExtension';
  import { createElement } from 'react';
  import { CollectionsYAMLPickerFieldExtension } from './extensions';
  
  jest.mock('./CollectionsYAMLPickerExtension', () => ({
    CollectionsYAMLPickerExtension: () =>
      createElement('div', null, 'CollectionsYAMLPickerExtension'),
  }));
  
  describe('CollectionsYAMLPickerFieldExtension', () => {
    it('should call scaffolderPlugin.provide with the correct extension', () => {
      expect(CollectionsYAMLPickerFieldExtension).toBeDefined();
  
      expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
        name: 'CollectionsYAMLPicker',
        component: CollectionsYAMLPickerExtension,
      });
  
      expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
        name: 'CollectionsYAMLPicker',
        component: CollectionsYAMLPickerExtension,
      });
    });
  
    it('should export the correct extension name', () => {
      expect(CollectionsYAMLPickerExtension).toBeDefined();
    });
  });