import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { AAPResourcePicker } from './AAPResourcePicker';
import { createElement } from 'react';
import { AAPResourcePickerExtension } from './extensions';

// Mock the scaffolder plugin and field extension creation
jest.mock('@backstage/plugin-scaffolder', () => ({
  scaffolderPlugin: {
    provide: jest.fn(arg => arg),
  },
}));

jest.mock('@backstage/plugin-scaffolder-react', () => ({
  createScaffolderFieldExtension: jest.fn(arg => arg),
}));

jest.mock('./AAPResourcePicker', () => ({
  AAPResourcePicker: () => createElement('div', null, 'AAPResourcePicker'),
}));

describe('AAPResourcePickerExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    // Trigger import usage
    void AAPResourcePickerExtension;

    // Check that createScaffolderFieldExtension was called with correct args
    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'AAPResourcePicker',
      component: AAPResourcePicker,
    });

    // Check that scaffolderPlugin.provide was called with the result
    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'AAPResourcePicker',
      component: AAPResourcePicker,
    });

    // The exported component should match the mocked component
    expect(AAPResourcePicker.name).toBe('AAPResourcePicker');
  });
});
