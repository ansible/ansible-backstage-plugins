import { dynamicPluginInstaller } from './index';
import { scaffolderModuleAnsible } from '../module';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns scaffolderModuleAnsible', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(scaffolderModuleAnsible);
  });
});
