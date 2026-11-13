import { dynamicPluginInstaller } from './index';
import { scaffolderModuleAap } from '../module';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns scaffolderModuleAap', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(scaffolderModuleAap);
  });
});
