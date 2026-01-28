import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { SCMResourcePicker } from './SCMResourcePicker';
import { createElement } from 'react';
import { SCMResourcePickerExtension } from './extensions';

// Mock the scaffolder plugin and field extension creation
jest.mock('@backstage/plugin-scaffolder', () => ({
  scaffolderPlugin: {
    provide: jest.fn(arg => arg),
  },
}));

jest.mock('@backstage/plugin-scaffolder-react', () => ({
  createScaffolderFieldExtension: jest.fn(arg => arg),
}));

jest.mock('./SCMResourcePicker', () => ({
  SCMResourcePicker: () => createElement('div', null, 'SCMResourcePicker'),
}));

describe('SCMResourcePickerExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    // Trigger import usage
    void SCMResourcePickerExtension;

    // Check that createScaffolderFieldExtension was called with correct args
    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'SCMResourcePicker',
      component: SCMResourcePicker,
    });

    // Check that scaffolderPlugin.provide was called with the result
    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'SCMResourcePicker',
      component: SCMResourcePicker,
    });

    // The exported component should match the mocked component
    expect(SCMResourcePicker.name).toBe('SCMResourcePicker');
  });
});
