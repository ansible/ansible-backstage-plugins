import { dynamicPluginInstaller } from './index';
import scaffolderBackendModule from '..';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns the scaffolder feature loader', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(scaffolderBackendModule);
  });
});
