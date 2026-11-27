jest.mock('@backstage/plugin-scaffolder', () => ({
  scaffolderPlugin: {
    provide: jest.fn(arg => arg),
  },
}));

jest.mock('@backstage/plugin-scaffolder-react', () => ({
  createScaffolderFieldExtension: jest.fn(arg => arg),
}));

jest.mock('./ScmSelectorExtension', () => ({
  ScmSelectorExtension: jest.fn(),
}));

import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { ScmSelectorExtension } from './ScmSelectorExtension';
import { ScmSelectorFieldExtension } from './extensions';

describe('ScmSelectorFieldExtension', () => {
  it('should call scaffolderPlugin.provide with the correct extension', () => {
    expect(ScmSelectorFieldExtension).toBeDefined();

    expect(createScaffolderFieldExtension).toHaveBeenCalledWith({
      name: 'ScmSelector',
      component: ScmSelectorExtension,
    });

    expect(scaffolderPlugin.provide).toHaveBeenCalledWith({
      name: 'ScmSelector',
      component: ScmSelectorExtension,
    });
  });

  it('should export the correct extension name', () => {
    expect(ScmSelectorExtension).toBeDefined();
  });
});
