import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { AAPTokenField } from './AAPTokenFieldExtension';
import { AAPTokenFieldFieldSchema } from './schema';
import { createElement } from 'react';
import { AAPTokenFieldExtension } from './extensions';

// Mock the scaffolder plugin and field extension creation
jest.mock('@backstage/plugin-scaffolder', () => ({
  scaffolderPlugin: {
    provide: jest.fn(arg => arg),
  },
}));

jest.mock('@backstage/plugin-scaffolder-react', () => ({
  createScaffolderFieldExtension: jest.fn(arg => arg),
}));

jest.mock('./AAPTokenFieldExtension', () => ({
  AAPTokenField: () => createElement('div', null, 'AAPTokenField'),
}));

jest.mock('./schema', () => ({
  AAPTokenFieldFieldSchema: { type: 'string', title: 'AAP Token' },
}));

describe('AAPTokenFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    // Trigger the import side-effect by just referencing the extension
    void AAPTokenFieldExtension;

    // Check that createScaffolderFieldExtension was called with correct args
    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'AAPTokenField',
      component: AAPTokenField,
      schema: AAPTokenFieldFieldSchema,
    });

    // Check that scaffolderPlugin.provide was called with the result
    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'AAPTokenField',
      component: AAPTokenField,
      schema: AAPTokenFieldFieldSchema,
    });

    // The exported component should match the mocked component
    expect(AAPTokenField.name).toBe('AAPTokenField');
  });
});
