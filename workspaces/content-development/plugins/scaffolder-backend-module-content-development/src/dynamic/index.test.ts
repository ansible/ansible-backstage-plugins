import { dynamicPluginInstaller } from './index';
import { scaffolderModuleContentDevelopment } from '../module';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns scaffolderModuleContentDevelopment', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(scaffolderModuleContentDevelopment);
  });
});
