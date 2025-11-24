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
import { MCPServersPickerExtension } from './MCPServersPickerExtension';
import { createElement } from 'react';
import { MCPServersPickerFieldExtension } from './extensions';

jest.mock('./MCPServersPickerExtension', () => ({
  MCPServersPickerExtension: () =>
    createElement('div', null, 'MCPServersPickerExtension'),
}));

describe('MCPServersPickerFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(MCPServersPickerFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'MCPServersPicker',
      component: MCPServersPickerExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'MCPServersPicker',
      component: MCPServersPickerExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(MCPServersPickerExtension).toBeDefined();
  });
});
