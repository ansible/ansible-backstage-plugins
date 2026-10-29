import { dynamicPluginInstaller } from './index';
import { scaffolderModulePortalScaffolder } from '../module';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns scaffolderModulePortalScaffolder', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(scaffolderModulePortalScaffolder);
  });
});
